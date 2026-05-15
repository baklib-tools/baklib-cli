/**
 * 主题预览同步：由管理面板开关驱动（创建/删除会话 + 首次同步 + 目录监控）。
 * 与 `process.env.BAKLIB_PREVIEW_SESSION_ID` 同步，供路径预览中间件读取。
 */
import { watch } from "node:fs";
import path from "node:path";
import { getPanelSyncOptions } from "./panel-sync-options.js";

/** @type {number} */
let lastSyncedFileCount = 0;

/** @type {string | null} */
let sessionId = null;
/** @type {import("node:fs").FSWatcher | null} */
let watcher = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let debounceTimer = null;
/** @type {ReturnType<typeof setInterval> | null} */
let keepaliveTimer = null;

/** @type {"off" | "starting" | "syncing" | "watching" | "stopping" | "error"} */
let status = "off";

/** @type {string[]} */
let logs = [];

let busy = false;

/** 避免保活与上一次保活重叠 */
let keepaliveInFlight = false;

const SESSION_KEEPALIVE_MS = 60_000;

/** 内存中保留的预览同步日志条数上限（超出则丢弃最早行） */
const MAX_LOG_LINES = 800;

/** @type {Promise<void>} */
let syncOpChain = Promise.resolve();

/**
 * 串行执行开启/关闭，避免与进行中的创建会话交错。
 * @param {() => Promise<void>} fn
 * @returns {Promise<void>}
 */
function enqueueSyncOp(fn) {
  const next = syncOpChain.then(fn, fn);
  syncOpChain = next.catch(() => {});
  return next;
}

function ts() {
  return new Date().toISOString().slice(11, 19);
}

/**
 * @param {string} line
 */
export function previewSyncLog(line) {
  logs.push(`[${ts()}] ${line}`);
  if (logs.length > MAX_LOG_LINES) logs = logs.slice(-MAX_LOG_LINES);
}

function clearDebounce() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function clearKeepalive() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

function scheduleKeepalive() {
  clearKeepalive();
  keepaliveTimer = setInterval(() => {
    void runSessionKeepalive();
  }, SESSION_KEEPALIVE_MS);
}

/**
 * 将当前入口与语言下的主题文件再次 sync，用于延长服务端预览会话有效期。
 */
async function runSessionKeepalive() {
  if (!sessionId || keepaliveInFlight) return;
  const sid = sessionId;
  const themeDir = process.env.BAKLIB_THEME_DIR;
  if (!themeDir) return;

  keepaliveInFlight = true;
  try {
    const api = await getBaklibApi();
    const files = await buildThemeFilesMapForSession();
    await api.themePreview.sync({ sessionId: sid, files });
    lastSyncedFileCount = Object.keys(files).length;
    lastSyncedFileCount = Object.keys(files).length;
  } catch (e) {
    const msg = String(e?.message || e);
    previewSyncLog(`会话保活失败：${msg}`);
    if (isSessionLikelyExpiredError(msg)) {
      await tearDownSessionAfterExpiry("预览会话已失效或过期，请关闭并重新开启「同步模版到预览」");
    }
  } finally {
    keepaliveInFlight = false;
  }
}

/** @param {string} msg */
function isSessionLikelyExpiredError(msg) {
  return /422/.test(msg) || /过期/.test(msg) || /无效/.test(msg) || /invalid or expired/i.test(msg);
}

/** 会话过期清理互斥，避免并发重复日志与 DELETE */
let sessionExpiryTeardownBusy = false;

/** @param {string} line */
async function tearDownSessionAfterExpiry(line) {
  if (sessionExpiryTeardownBusy) return;
  sessionExpiryTeardownBusy = true;
  try {
    clearKeepalive();
    const sid = sessionId;
    sessionId = null;
    delete process.env.BAKLIB_PREVIEW_SESSION_ID;
    clearDebounce();
    try {
      watcher?.close();
    } catch {
      /* ignore */
    }
    watcher = null;
    status = "error";
    previewSyncLog(line);
    if (sid) {
      try {
        const api = await getBaklibApi();
        await api.themePreview.deleteSession({ sessionId: sid });
      } catch {
        /* ignore */
      }
    }
  } finally {
    sessionExpiryTeardownBusy = false;
  }
}

async function buildThemeFilesMapForSession() {
  const themeDir = process.env.BAKLIB_THEME_DIR;
  if (!themeDir) throw new Error("BAKLIB_THEME_DIR missing");
  const root = path.resolve(themeDir);
  const { buildThemePreviewFilesMap, buildThemePreviewFilesMapFromManualPaths } = await import(
    new URL("../../src/lib/theme-preview-liquid-deps.js", import.meta.url).href
  );
  const { resolvePreviewLocale } = await import(new URL("../../src/lib/theme-preview-locale.js", import.meta.url).href);
  const panel = getPanelSyncOptions();
  const locale = resolvePreviewLocale(panel.previewLocale || process.env.BAKLIB_PREVIEW_LOCALE || "");
  if (panel.manualPaths?.length) {
    return buildThemePreviewFilesMapFromManualPaths({
      themeRoot: root,
      locale,
      manualLiquidPaths: panel.manualPaths,
    });
  }
  const entryRel = process.env.BAKLIB_PREVIEW_ENTRY || "templates/index.liquid";
  return buildThemePreviewFilesMap({
    themeRoot: root,
    entryRel,
    locale,
  });
}

/**
 * @returns {{ enabled: boolean, status: string, logs: string[], sessionPreview: string | null }}
 */
export function getPreviewSyncSnapshot() {
  return {
    enabled: Boolean(sessionId),
    status,
    logs: [...logs],
    sessionPreview: sessionId ? `${sessionId.slice(0, 8)}…` : null,
    lastSyncedFileCount,
  };
}

function debouncePush(fn, ms) {
  clearDebounce();
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    fn();
  }, ms);
}

async function getBaklibApi() {
  const { createBaklibApi } = await import(new URL("../../src/api/index.js", import.meta.url).href);
  const { resolveOpenApiBaseUrl } = await import(new URL("./open-api-defaults.js", import.meta.url).href);
  const token = process.env.BAKLIB_TOKEN || process.env.BAKLIB_MCP_TOKEN;
  const rawBase = process.env.BAKLIB_API_BASE || process.env.BAKLIB_MCP_API_BASE || "";
  if (!token) throw new Error("缺少 BAKLIB_TOKEN");
  return createBaklibApi({ token, apiBase: resolveOpenApiBaseUrl(rawBase) });
}

/**
 * @returns {Promise<void>}
 */
export async function stopPreviewSyncRuntime() {
  return enqueueSyncOp(async () => {
    if (!sessionId && !watcher) {
      status = "off";
      return;
    }
    busy = true;
    status = "stopping";
    previewSyncLog("正在关闭同步并删除预览会话…");
    try {
      clearKeepalive();
      try {
        watcher?.close();
      } catch {
        /* ignore */
      }
      watcher = null;
      clearDebounce();
      const sid = sessionId;
      sessionId = null;
      delete process.env.BAKLIB_PREVIEW_SESSION_ID;
      lastSyncedFileCount = 0;
      if (sid) {
        try {
          const api = await getBaklibApi();
          await api.themePreview.deleteSession({ sessionId: sid });
          previewSyncLog("服务端预览会话已删除");
        } catch (e) {
          previewSyncLog(`删除会话时出错（可忽略）：${String(e?.message || e)}`);
        }
      }
      status = "off";
      previewSyncLog("已停止监控主题目录");
    } finally {
      busy = false;
    }
  });
}

/**
 * @returns {Promise<void>}
 */
export async function startPreviewSyncRuntime() {
  return enqueueSyncOp(async () => {
    if (sessionId) {
      previewSyncLog("预览同步已开启，无需重复开启");
      return;
    }
    const themeDir = process.env.BAKLIB_THEME_DIR;
    if (!themeDir) {
      status = "error";
      previewSyncLog("错误：未设置 BAKLIB_THEME_DIR");
      return;
    }
    logs = [];
    busy = true;
    status = "starting";
    previewSyncLog("正在创建预览会话…");
    try {
      const api = await getBaklibApi();
      const { themePreviewSessionIdFromResponse } = await import(
        new URL("../../src/api/ops-theme-preview.js", import.meta.url).href
      );

      const entryRel = process.env.BAKLIB_PREVIEW_ENTRY || "templates/index.liquid";
      const panel = getPanelSyncOptions();
      const locale = (await import(new URL("../../src/lib/theme-preview-locale.js", import.meta.url).href)).resolvePreviewLocale(
        panel.previewLocale || process.env.BAKLIB_PREVIEW_LOCALE || "",
      );

      const sess = await api.themePreview.createSession();
      const sid = themePreviewSessionIdFromResponse(sess);
      if (!sid) {
        throw new Error(`创建预览会话失败：响应中无 session_id。响应: ${JSON.stringify(sess)}`);
      }
      sessionId = sid;
      process.env.BAKLIB_PREVIEW_SESSION_ID = sid;
      previewSyncLog(`预览会话已创建（${sid.slice(0, 8)}…）`);

      status = "syncing";
      if (panel.manualPaths?.length) {
        previewSyncLog(`准备按手动勾选上传（${panel.manualPaths.length} 个 Liquid + 语言/config，语言 ${locale}）…`);
      } else {
        previewSyncLog(`正在扫描 Liquid 依赖并准备上传（入口 ${entryRel}，语言 ${locale}）…`);
      }
      const files = await buildThemeFilesMapForSession();
      const paths = Object.keys(files);
      const show = paths.slice(0, 12);
      for (const p of show) {
        previewSyncLog(`  · ${p}`);
      }
      if (paths.length > show.length) {
        previewSyncLog(`  … 共 ${paths.length} 个文件`);
      }
      previewSyncLog("正在上传到服务端预览缓存…");
      await api.themePreview.sync({ sessionId: sid, files });
      lastSyncedFileCount = paths.length;
      previewSyncLog(`同步完成（${paths.length} 个文件），路径 HTML 预览已就绪`);

      status = "watching";
      previewSyncLog("正在监控主题目录变更（防抖 300ms 后自动再同步）…");

      const push = async () => {
        if (!sessionId) return;
        try {
          previewSyncLog("检测到文件变更，正在重新同步…");
          const f = await buildThemeFilesMapForSession();
          await api.themePreview.sync({ sessionId: sessionId, files: f });
          lastSyncedFileCount = Object.keys(f).length;
          previewSyncLog(`增量同步完成（${Object.keys(f).length} 个文件）`);
        } catch (e) {
          const msg = String(e?.message || e);
          previewSyncLog(`同步失败：${msg}`);
          if (isSessionLikelyExpiredError(msg)) {
            await tearDownSessionAfterExpiry("预览会话已失效或过期，请关闭并重新开启「同步模版到预览」");
          }
        }
      };
      const debounced = () => debouncePush(() => void push(), 300);

      try {
        watcher = watch(path.resolve(themeDir), { recursive: true }, () => {
          debounced();
        });
      } catch (e) {
        previewSyncLog(`无法监听目录（本机可能不支持 recursive watch）：${String(e?.message || e)}`);
      }

      scheduleKeepalive();
      previewSyncLog(`已启用定时保活（每 ${SESSION_KEEPALIVE_MS / 1000}s 同步一次以延长会话）`);
    } catch (e) {
      clearKeepalive();
      status = "error";
      previewSyncLog(`错误：${String(e?.message || e)}`);
      const sid = sessionId;
      sessionId = null;
      delete process.env.BAKLIB_PREVIEW_SESSION_ID;
      try {
        watcher?.close();
      } catch {
        /* ignore */
      }
      watcher = null;
      clearDebounce();
      if (sid) {
        try {
          const api = await getBaklibApi();
          await api.themePreview.deleteSession({ sessionId: sid });
          previewSyncLog("已回滚：预览会话已删除");
        } catch {
          /* ignore */
        }
      }
    } finally {
      busy = false;
      if (sessionId && status !== "error") status = "watching";
      else if (!sessionId && status !== "error") status = "off";
    }
  });
}

/**
 * 进程退出时由 CLI 调用，确保删除会话。
 * @returns {Promise<void>}
 */
export async function shutdownPreviewSyncRuntime() {
  await stopPreviewSyncRuntime();
  logs = [];
}

/**
 * 面板修改语言或手动勾选路径后，在已开启同步时立即重传。
 * @returns {Promise<void>}
 */
export function resyncPreviewSessionFromPanel() {
  return enqueueSyncOp(async () => {
    if (!sessionId) return;
    try {
      const api = await getBaklibApi();
      previewSyncLog("面板选项变更，正在重新同步…");
      const f = await buildThemeFilesMapForSession();
      await api.themePreview.sync({ sessionId, files: f });
      lastSyncedFileCount = Object.keys(f).length;
      previewSyncLog(`重新同步完成（${Object.keys(f).length} 个文件）`);
    } catch (e) {
      previewSyncLog(`重新同步失败：${String(e?.message || e)}`);
    }
  });
}
