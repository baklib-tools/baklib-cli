import path from "node:path";
import fs from "node:fs";
import { rewritePreviewHtml } from "./server/html-rewrite.js";
import { getPortalRawForDev, resolvePortalAssetUrl } from "./server/portal-asset-url.js";
import { fetchUrlWithDiskCache } from "./server/remote-asset-cache.js";
import { handleBaklibProxyRequest } from "./server/upstream-proxy.js";
import {
  getPreviewSyncSnapshot,
  resyncPreviewSessionFromPanel,
  startPreviewSyncRuntime,
  stopPreviewSyncRuntime,
} from "./server/preview-sync-runtime.js";
import {
  buildPreviewLocalPageForPath,
  ensureDevId,
  findRemotePageSummaryRow,
  getDevState,
  mergeDevState,
  normalizePreviewPath,
  setDevState,
} from "./server/dev-preview-state.js";
import { applyDevStateToPanelEnv } from "./server/apply-dev-state-to-panel.js";
import { jsonApiDataArray, jsonApiRowsToRemotePageRows } from "./server/jsonapi-pages.js";
import { isPreviewRenderDashScopePath } from "./server/preview-dash-routes.js";
import { themeAssetRelFromThemeAssetsDashPath } from "./server/theme-assets-dash-path.js";
import { handlePreviewLiveReloadRequest } from "./server/preview-live-reload.js";
import { enrichLocalPageWithRemoteDetail } from "./server/preview-local-page-enrich.js";
import { THEME_PREVIEW_ADMIN_PANEL_PATH as ADMIN_PANEL_PATH } from "../src/lib/theme-preview-constants.js";

const MAX_ACCESS_LOG = 250;
/** @type {string[]} */
let accessLogLines = [];

function pushAccessLine(line) {
  const ts = new Date().toISOString().slice(11, 19);
  accessLogLines.push(`[${ts}] ${line}`);
  if (accessLogLines.length > MAX_ACCESS_LOG) {
    accessLogLines = accessLogLines.slice(-MAX_ACCESS_LOG);
  }
}

function getAccessLogsSnapshot() {
  return [...accessLogLines];
}

/** @param {string} s */
function escapeHtmlAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseQuery(url) {
  const u = new URL(url, "http://vite.local");
  return Object.fromEntries(u.searchParams.entries());
}

function safeThemeFile(themeDir, rel) {
  const root = path.resolve(themeDir);
  const full = path.resolve(root, rel.split("?")[0]);
  if (!full.startsWith(root + path.sep) && full !== root) {
    return null;
  }
  return full;
}

/** @param {string} urlPath */
function looksLikeStaticAsset(urlPath) {
  // 门户 `/-/…` 可能为 `.js`（如 bk-tips-helper），须走预览或回源，不能交给 Vite 静态
  if (urlPath.startsWith("/-/")) return false;
  return /\.(?:css|js|mjs|cjs|map|ico|png|jpe?g|gif|svg|webp|woff2?|ttf|eot|json|html|txt|liquid)$/i.test(
    urlPath.split("/").pop() || "",
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

let apiCache;

async function getBaklibApi() {
  if (apiCache) return apiCache;
  const { createBaklibApi } = await import(new URL("../src/api/index.js", import.meta.url).href);
  const { resolveOpenApiBaseUrl } = await import(new URL("./server/open-api-defaults.js", import.meta.url).href);
  const token = process.env.BAKLIB_TOKEN || process.env.BAKLIB_MCP_TOKEN;
  const rawBase = process.env.BAKLIB_API_BASE || process.env.BAKLIB_MCP_API_BASE || "";
  if (!token) throw new Error("缺少 BAKLIB_TOKEN");
  apiCache = createBaklibApi({ token, apiBase: resolveOpenApiBaseUrl(rawBase) });
  return apiCache;
}

function previewSessionActive() {
  return Boolean(process.env.BAKLIB_PREVIEW_SESSION_ID);
}

export function baklibPreviewPlugin() {
  return {
    name: "baklib-preview",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || "";
        const urlPath = rawUrl.split("?")[0] || "";
        try {
          if (req.headers.upgrade === "websocket" || urlPath.startsWith("/__vite")) {
            next();
            return;
          }

          if (urlPath.startsWith("/__baklib_live_reload/")) {
            if (handlePreviewLiveReloadRequest(req, res, urlPath)) return;
            res.statusCode = 404;
            res.end("Not found");
            return;
          }

          if (urlPath.startsWith("/__theme_asset/")) {
            await serveThemeAsset(req, res, rawUrl);
            return;
          }

          if (urlPath.startsWith("/__baklib_proxy")) {
            await handleBaklibProxyRequest(req, res, rawUrl);
            return;
          }

          if (urlPath.startsWith("/api/baklib/")) {
            await handleApiBaklib(req, res, rawUrl);
            return;
          }

          if (urlPath === ADMIN_PANEL_PATH || urlPath.startsWith(`${ADMIN_PANEL_PATH}/`)) {
            next();
            return;
          }

          if (
            urlPath.startsWith("/@") ||
            urlPath.startsWith("/src/") ||
            urlPath.startsWith("/node_modules/") ||
            urlPath === "/favicon.ico"
          ) {
            next();
            return;
          }

          if (looksLikeStaticAsset(urlPath)) {
            res.once("finish", () => {
              pushAccessLine(`${req.method} ${urlPath} → ${res.statusCode} (static→vite)`);
            });
            next();
            return;
          }

          /**
           * 门户 `/-/rails/active_storage`、`/-/theme-assets`、dam 等：与线上同路径向 portal 回源
           *（磁盘缓存）。与 `preview_render` 重叠的 Liquid 页仅在已开启预览会话时仍走 API。
           */
          if (req.method === "GET" && urlPath.startsWith("/-/")) {
            const usePreviewRender = isPreviewRenderDashScopePath(urlPath) && previewSessionActive();
            if (!usePreviewRender) {
              if (urlPath.startsWith("/-/theme-assets/")) {
                const served = await tryServeThemeAssetsDashLocally(req, res, rawUrl);
                if (served) return;
              }
              await servePortalDashPath(req, res, rawUrl);
              return;
            }
          }

          if (!previewSessionActive() && req.method === "GET") {
            if (urlPath === "/") {
              res.statusCode = 302;
              res.setHeader("Location", ADMIN_PANEL_PATH);
              pushAccessLine(`${req.method} ${urlPath} → 302 (redirect admin, no session)`);
              res.end();
              return;
            }
            res.statusCode = 503;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            pushAccessLine(`${req.method} ${urlPath} → 503 (no preview session)`);
            res.end(
              `<!doctype html><meta charset="utf-8"><p>尚未启用预览同步，无法渲染站点路径 <code>${escapeHtmlAttr(
                urlPath,
              )}</code>。</p><p>请在 <a href="${ADMIN_PANEL_PATH}">主题开发管理面板</a> 右侧底部打开「<strong>同步模版到预览</strong>」开关（将创建会话并上传主题），然后再访问该路径。</p>`,
            );
            return;
          }

          if (req.method === "GET" && previewSessionActive()) {
            await handleSitePathPreview(req, res, urlPath);
            return;
          }
        } catch (e) {
          pushAccessLine(`${req.method || "?"} ${(req.url || "").split("?")[0]} → 500 (middleware error)`);
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(String(e?.message || e));
          return;
        }
        res.once("finish", () => {
          pushAccessLine(`${req.method} ${urlPath} → ${res.statusCode} (vite-fallback)`);
        });
        next();
      });
    },
  };
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {string} rawUrl
 */
async function handleApiBaklib(req, res, rawUrl) {
  const urlPath = rawUrl.split("?")[0] || "";
  try {

  if (urlPath === "/api/baklib/preview-sync-state" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ...getPreviewSyncSnapshot(),
        accessLogs: getAccessLogsSnapshot(),
      }),
    );
    return;
  }

  if (urlPath === "/api/baklib/preview-sync-toggle" && req.method === "POST") {
    let body = {};
    try {
      const text = await readBody(req);
      body = text ? JSON.parse(text) : {};
    } catch {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "invalid JSON body" }));
      return;
    }
    const enabled = Boolean(body.enabled);
    const ensuredToggle = ensureDevId(req.headers.cookie);
    if (ensuredToggle.setCookie) res.setHeader("Set-Cookie", ensuredToggle.setCookie);
    applyDevStateToPanelEnv(ensuredToggle.id);
    if (enabled) await startPreviewSyncRuntime();
    else await stopPreviewSyncRuntime();
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        ...getPreviewSyncSnapshot(),
        accessLogs: getAccessLogsSnapshot(),
      }),
    );
    return;
  }

  if (urlPath === "/api/baklib/dev-meta" && req.method === "GET") {
    const themeDir = process.env.BAKLIB_THEME_DIR;
    /** @type {Record<string, unknown>} */
    const payload = {
      previewSession: previewSessionActive(),
      previewOrigin: process.env.BAKLIB_PREVIEW_ORIGIN || null,
      adminPath: ADMIN_PANEL_PATH,
    };
    if (themeDir) {
      const { listThemeLocaleTags, listManualSyncTemplatePaths, listTemplateBasenames } = await import(
        new URL("./server/theme-manual-sync-files.js", import.meta.url).href
      );
      const { listThemeStaticPreviewRoutes } = await import(new URL("./server/list-theme-static-pages.js", import.meta.url).href);
      const { THEME_PREVIEW_MAX_FILES } = await import(new URL("../src/lib/theme-preview-constants.js", import.meta.url).href);
      payload.localeTags = await listThemeLocaleTags(themeDir);
      payload.manualSyncTemplatePaths = await listManualSyncTemplatePaths(themeDir);
      payload.templateBasenames = await listTemplateBasenames(themeDir);
      payload.maxPreviewSyncFiles = THEME_PREVIEW_MAX_FILES;
      payload.staticPreviewRoutes = await listThemeStaticPreviewRoutes(themeDir);
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
    return;
  }

  if (urlPath === "/api/baklib/preview-sync-auto-liquid-paths" && req.method === "GET") {
    const ensured = ensureDevId(req.headers.cookie);
    if (ensured.setCookie) res.setHeader("Set-Cookie", ensured.setCookie);
    applyDevStateToPanelEnv(ensured.id);
    const themeDir = process.env.BAKLIB_THEME_DIR;
    res.setHeader("Content-Type", "application/json");
    if (!themeDir) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "BAKLIB_THEME_DIR missing" }));
      return;
    }
    const root = path.resolve(themeDir);
    try {
      const { collectLiquidDependencyPaths } = await import(new URL("../src/lib/theme-preview-liquid-deps.js", import.meta.url).href);
      const { resolvePreviewLocale } = await import(new URL("../src/lib/theme-preview-locale.js", import.meta.url).href);
      const { THEME_PREVIEW_MAX_FILES } = await import(new URL("../src/lib/theme-preview-constants.js", import.meta.url).href);
      const { getPanelSyncOptions } = await import(new URL("./server/panel-sync-options.js", import.meta.url).href);
      const panel = getPanelSyncOptions();
      const locale = resolvePreviewLocale(panel.previewLocale || process.env.BAKLIB_PREVIEW_LOCALE || "");
      const locJson = `locales/${locale}.json`;
      const locSchema = `locales/${locale}.schema.json`;
      /** @param {string} rel */
      const exists = async (rel) => {
        try {
          const st = await fs.promises.stat(path.join(root, rel));
          return st.isFile();
        } catch {
          return false;
        }
      };
      let reserved = 0;
      if (await exists(locJson)) reserved += 1;
      if (await exists(locSchema)) reserved += 1;
      if (await exists("config/settings_schema.json")) reserved += 1;
      const liquidCap = Math.max(1, THEME_PREVIEW_MAX_FILES - reserved);
      const entryRel = String(process.env.BAKLIB_PREVIEW_ENTRY || "templates/index.liquid")
        .replace(/\\/g, "/")
        .replace(/^\//, "");
      const paths = await collectLiquidDependencyPaths({
        themeRoot: root,
        entryRel,
        maxFiles: liquidCap,
      });
      res.end(JSON.stringify({ paths }));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(e?.message || e) }));
    }
    return;
  }

  if (urlPath === "/api/baklib/sites" && req.method === "GET") {
    const api = await getBaklibApi();
    const r = await api.site.listSites({ per_page: 50 });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: r.data, meta: r.meta }));
    return;
  }

  const pagesMatch = /^\/api\/baklib\/sites\/([^/]+)\/pages$/.exec(urlPath);
  if (pagesMatch && req.method === "GET") {
    const api = await getBaklibApi();
    const siteId = decodeURIComponent(pagesMatch[1]);
    const r = await api.site.listPages({ site_id: siteId, per_page: 100, include_details: true });
    const rawRows = jsonApiDataArray(r.full_response || { data: r.data });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: rawRows, meta: r.meta }));
    return;
  }

  if (urlPath === "/api/baklib/dev-state" && req.method === "GET") {
    const { id, setCookie } = ensureDevId(req.headers.cookie);
    applyDevStateToPanelEnv(id);
    const state = getDevState(id) || {};
    res.setHeader("Content-Type", "application/json");
    if (setCookie) res.setHeader("Set-Cookie", setCookie);
    res.end(JSON.stringify({ id, state }));
    return;
  }

  if (urlPath === "/api/baklib/dev-state" && req.method === "POST") {
    const text = await readBody(req);
    const body = text ? JSON.parse(text) : {};
    const { id, setCookie } = ensureDevId(req.headers.cookie);
    const incoming = body.state && typeof body.state === "object" ? body.state : body;
    const prev = getDevState(id) || {};
    mergeDevState(id, incoming);
    const after = getDevState(id) || {};
    applyDevStateToPanelEnv(id);
    const prevLoc = String(prev.previewLocale || "zh-CN");
    const nextLoc = String(after.previewLocale || "zh-CN");
    const prevMan = JSON.stringify(Array.isArray(prev.previewSyncManualPaths) ? prev.previewSyncManualPaths : []);
    const nextMan = JSON.stringify(Array.isArray(after.previewSyncManualPaths) ? after.previewSyncManualPaths : []);
    if (previewSessionActive() && (prevLoc !== nextLoc || prevMan !== nextMan)) {
      void resyncPreviewSessionFromPanel();
    }
    res.setHeader("Content-Type", "application/json");
    if (setCookie) res.setHeader("Set-Cookie", setCookie);
    res.end(JSON.stringify({ ok: true, id }));
    return;
  }

  if (urlPath === "/api/baklib/preview-sync" && req.method === "POST") {
    const sessionId = process.env.BAKLIB_PREVIEW_SESSION_ID;
    const themeDir = process.env.BAKLIB_THEME_DIR;
    if (!sessionId || !themeDir) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "BAKLIB_PREVIEW_SESSION_ID 或 BAKLIB_THEME_DIR 未设置" }));
      return;
    }
    const text = await readBody(req);
    const body = text ? JSON.parse(text) : {};
    const entryRel = typeof body.entry === "string" ? body.entry : "templates/index.liquid";
    const { buildThemePreviewFilesMap, buildThemePreviewFilesMapFromManualPaths } = await import(
      new URL("../src/lib/theme-preview-liquid-deps.js", import.meta.url).href
    );
    const { resolvePreviewLocale } = await import(new URL("../src/lib/theme-preview-locale.js", import.meta.url).href);
    const locale = resolvePreviewLocale(body.locale);
    const manual = Array.isArray(body.manualLiquidPaths) ? body.manualLiquidPaths.filter((x) => typeof x === "string") : [];
    const files =
      manual.length > 0
        ? await buildThemePreviewFilesMapFromManualPaths({
            themeRoot: path.resolve(themeDir),
            locale,
            manualLiquidPaths: manual,
          })
        : await buildThemePreviewFilesMap({
            themeRoot: path.resolve(themeDir),
            entryRel,
            locale,
          });
    const api = await getBaklibApi();
    const sync = await api.themePreview.sync({ sessionId, files });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, synced: sync.synced, paths: Object.keys(files) }));
    return;
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "unknown api" }));
  } catch (e) {
    const msg = String(e?.message || e);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: msg }));
    }
  }
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {string} urlPath
 */
async function handleSitePathPreview(req, res, urlPath) {
  const ensured = ensureDevId(req.headers.cookie);
  if (ensured.setCookie) {
    res.setHeader("Set-Cookie", ensured.setCookie);
  }
  const devId = ensured.id;

  const sessionId = process.env.BAKLIB_PREVIEW_SESSION_ID;
  if (!sessionId) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    pushAccessLine(`${req.method} ${urlPath} → 503 (preview: no session id)`);
    res.end(
      `<!doctype html><meta charset="utf-8"><p>未启用预览同步。请在 <a href="${ADMIN_PANEL_PATH}">主题开发管理面板</a> 右侧打开「同步模版到预览」开关，以创建会话并上传主题。</p>`,
    );
    return;
  }

  let state = getDevState(devId) || {};
  const siteId = state?.siteId || process.env.BAKLIB_PREVIEW_SITE_ID;
  if (!siteId) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    pushAccessLine(`${req.method} ${urlPath} → 503 (preview: no site)`);
    res.end(
      `<!doctype html><meta charset="utf-8"><p>请先在 <a href="${ADMIN_PANEL_PATH}">主题开发管理面板</a> 选择站点。</p>`,
    );
    return;
  }

  const pathNorm = normalizePreviewPath(urlPath);
  const localPageRaw = buildPreviewLocalPageForPath(state || { localPages: [], pageTextSettings: {} }, pathNorm);
  const summaryRow = findRemotePageSummaryRow(state || {}, pathNorm);
  let localPage = localPageRaw;
  if (localPage && summaryRow?.id && siteId) {
    try {
      localPage = await enrichLocalPageWithRemoteDetail(String(siteId), String(summaryRow.id), localPage);
    } catch (err) {
      pushAccessLine(
        `preview_render enrich: ${String(err instanceof Error ? err.message : err)}`,
      );
    }
  }

  const api = await getBaklibApi();
  const out = await api.themePreview.previewRender({
    sessionId,
    site_id: String(siteId),
    path: pathNorm,
    local_page: localPage || undefined,
    body_format: "markdown",
  });
  const htmlRaw = typeof out.html === "string" ? out.html : "";
  const httpStatus = typeof out._httpStatus === "number" ? out._httpStatus : 200;
  const html = rewritePreviewHtml(htmlRaw);
  res.statusCode = httpStatus;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  pushAccessLine(`${req.method} ${urlPath} → ${httpStatus} (preview_render path=${pathNorm})`);
  res.end(html);
}

/**
 * `/-/theme-assets/…`：优先读本地主题 `assets/`（与线上一致的路径 token），缺失时再回源门户。
 * @returns {Promise<boolean>} 已处理（含 404）时 true；无法解析路径时 false，由调用方回源
 */
async function tryServeThemeAssetsDashLocally(req, res, rawUrl) {
  const themeDir = process.env.BAKLIB_THEME_DIR;
  if (!themeDir) return false;

  const urlPath = rawUrl.split("?")[0] || "";
  const assetRel = themeAssetRelFromThemeAssetsDashPath(urlPath);
  if (assetRel == null) return false;

  const localFile = safeThemeFile(themeDir, `assets/${assetRel}`);
  if (!localFile || !fs.existsSync(localFile)) return false;

  res.statusCode = 200;
  res.setHeader("Content-Type", guessMime(localFile));
  res.setHeader("Cache-Control", "private, max-age=0");
  fs.createReadStream(localFile).pipe(res);
  pushAccessLine(`${req.method} ${urlPath} → 200 (/-/theme-assets local assets/${assetRel})`);
  return true;
}

/**
 * 将 `/-/…` 请求回源到门户（与站点 portal_url 同源），用于 active_storage、theme-assets 等。
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {string} rawUrl
 */
async function servePortalDashPath(req, res, rawUrl) {
  const urlPath = rawUrl.split("?")[0] || "";
  const ensured = ensureDevId(req.headers.cookie);
  if (ensured.setCookie) res.setHeader("Set-Cookie", ensured.setCookie);
  const portalRaw = getPortalRawForDev(ensured.id, getDevState);
  const u = new URL(rawUrl, "http://vite.local");
  const target = resolvePortalAssetUrl(portalRaw, { pathname: u.pathname, search: u.search });
  if (!target) {
    res.statusCode = 404;
    pushAccessLine(`${req.method} ${urlPath} → 404 (portal /-/ missing portal_url)`);
    res.end("Not found (set site portal_url or BAKLIB_PORTAL_ORIGIN)");
    return;
  }
  const r = await fetchUrlWithDiskCache(target);
  if (!r.ok) {
    res.statusCode = r.status;
    pushAccessLine(`${req.method} ${urlPath} → ${r.status} (portal /-/ upstream)`);
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", r.contentType);
  res.setHeader("Cache-Control", "private, max-age=300");
  pushAccessLine(`${req.method} ${urlPath} → 200 (portal /-/ ${r.cache})`);
  res.end(r.buffer);
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {string} rawUrl
 */
async function serveThemeAsset(req, res, rawUrl) {
  const themeDir = process.env.BAKLIB_THEME_DIR;
  if (!themeDir) {
    res.statusCode = 500;
    res.end("BAKLIB_THEME_DIR missing");
    return;
  }
  const urlPath = rawUrl.split("?")[0] || "";
  const ensured = ensureDevId(req.headers.cookie);
  if (ensured.setCookie) res.setHeader("Set-Cookie", ensured.setCookie);

  const rel = decodeURIComponent(urlPath.slice("/__theme_asset/".length));
  const localFile = safeThemeFile(themeDir, rel);
  if (localFile && fs.existsSync(localFile)) {
    res.setHeader("Content-Type", guessMime(localFile));
    fs.createReadStream(localFile).pipe(res);
    pushAccessLine(`${req.method} ${urlPath} → 200 (__theme_asset local)`);
    return;
  }

  const portalRaw = getPortalRawForDev(ensured.id, getDevState);
  const target = resolvePortalAssetUrl(portalRaw, { rel });
  if (!target) {
    res.statusCode = 404;
    pushAccessLine(`${req.method} ${urlPath} → 404 (__theme_asset no portal)`);
    res.end("Not found (local missing; set site portal_url or BAKLIB_PORTAL_ORIGIN)");
    return;
  }

  const r = await fetchUrlWithDiskCache(target);
  if (!r.ok) {
    res.statusCode = r.status;
    pushAccessLine(`${req.method} ${urlPath} → ${r.status} (__theme_asset remote)`);
    res.end();
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", r.contentType || guessMimeByRel(rel));
  res.setHeader("Cache-Control", "private, max-age=300");
  pushAccessLine(`${req.method} ${urlPath} → 200 (__theme_asset ${r.cache})`);
  res.end(r.buffer);
}

/** @param {string} rel */
function guessMimeByRel(rel) {
  const tail = String(rel).split("?")[0].split("/").pop() || "";
  return guessMime(`x/${tail}`);
}

function guessMime(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "application/javascript";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".liquid")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".map")) return "application/json";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".ttf")) return "font/ttf";
  if (lower.endsWith(".eot")) return "application/vnd.ms-fontobject";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}
