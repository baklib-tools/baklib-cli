/**
 * Baklib CLI 配置（惰性读取，不随模块加载退出进程）
 *
 * 优先级（同一字段：就近 `.baklib/baklib.json` 覆盖 `~/.config/baklib/baklib.json`；环境变量最后覆盖上述结果；其余路径仅补缺）：
 * 1. ~/.config/baklib/baklib.json
 * 2. 自 process.cwd() 向上递归，首个存在的 `.baklib/baklib.json`
 * 3. 兼容：工作区 `.config/`、~/.config/ 平铺凭据（BAKLIB_MCP_* 等）
 * 4. 环境变量 BAKLIB_TOKEN / BAKLIB_API_BASE（主机根；仍识别 BAKLIB_MCP_*；未配置主机时默认官方主机；请求固定追加 /api/v1）
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  DEFAULT_API_HOST,
  resolveOpenApiBaseUrl,
  openApiHostFromResolvedBase,
} from "../theme-preview/server/open-api-defaults.js";

export { DEFAULT_API_HOST, resolveOpenApiBaseUrl, openApiHostFromResolvedBase };

const USER_CONFIG_DIR = "baklib";
const BAKLIB_DIR = ".baklib";
const BAKLIB_JSON = "baklib.json";

/** 清除配置时从 JSON 中删除的字段（含别名） */
const BAKLIB_JSON_STRIP_KEYS = ["token", "apiHost", "api_host", "apiBase", "api_base"];

const ENV_TOKEN_KEYS = ["BAKLIB_TOKEN", "BAKLIB_MCP_TOKEN"];
const ENV_API_BASE_KEYS = ["BAKLIB_API_BASE", "BAKLIB_MCP_API_BASE"];
const LEGACY_WS_ENV_KEYS = ["BAKLIB_WORKSPACE", "BAKLIB_MCP_WORKSPACE"];

const LEGACY_USER_TOKEN_FILES = ["BAKLIB_MCP_TOKEN", "BAKLIB_TOKEN"];
const LEGACY_USER_API_BASE_FILES = ["BAKLIB_MCP_API_BASE", "BAKLIB_API_BASE"];
const LEGACY_WS_TOKEN_FILES = ["BAKLIB_MCP_TOKEN", "BAKLIB_TOKEN"];
const LEGACY_WS_API_BASE_FILES = ["BAKLIB_MCP_API_BASE", "BAKLIB_API_BASE"];

/** 用户级配置目录：~/.config/baklib */
export function getUserBaklibConfigDir() {
  return path.join(os.homedir(), ".config", USER_CONFIG_DIR);
}

export function getUserBaklibJsonPath() {
  return path.join(getUserBaklibConfigDir(), BAKLIB_JSON);
}

async function readTextFileIfExists(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const value = String(text).trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

async function pathIsDir(p) {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function pathIsFile(p) {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

/**
 * @param {string} filePath
 * @returns {Promise<{ token?: string, apiHost?: string } | null>}
 */
export async function readBaklibJsonFile(filePath) {
  if (!(await pathIsFile(filePath))) {
    return null;
  }
  const text = await readTextFileIfExists(filePath);
  if (!text) {
    return null;
  }
  try {
    const j = JSON.parse(text);
    if (!j || typeof j !== "object") {
      return null;
    }
    const token = typeof j.token === "string" ? j.token.trim() : "";
    const apiHost =
      typeof j.apiHost === "string"
        ? j.apiHost.trim()
        : typeof j.api_host === "string"
          ? j.api_host.trim()
          : typeof j.apiBase === "string"
            ? j.apiBase.trim()
            : typeof j.api_base === "string"
              ? j.api_base.trim()
              : "";
    const out = {};
    if (token) {
      out.token = token;
    }
    if (apiHost) {
      out.apiHost = apiHost;
    }
    return Object.keys(out).length ? out : {};
  } catch {
    return null;
  }
}

function applyBaklibJsonPatch(
  /** @type {{ token: string, apiHost: string }} */ acc,
  /** @type {{ token?: string, apiHost?: string } | null} */ patch,
) {
  if (!patch) {
    return;
  }
  if (patch.token) {
    acc.token = patch.token;
  }
  if (patch.apiHost) {
    acc.apiHost = patch.apiHost;
  }
}

/**
 * 自 startDir 起向根目录查找首个存在的 `.baklib/baklib.json`
 * @returns {Promise<string | null>} 绝对路径
 */
export async function findNearestBaklibJsonPath(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  while (true) {
    const jsonPath = path.join(dir, BAKLIB_DIR, BAKLIB_JSON);
    if (await pathIsFile(jsonPath)) {
      return jsonPath;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

async function readFirstFromDir(dir, names) {
  for (const name of names) {
    const v = await readTextFileIfExists(path.join(dir, name));
    if (v) {
      return v;
    }
  }
  return null;
}

/**
 * 合并写入指定路径的 baklib.json（保留其它键；必要时创建目录）
 * @param {string} filePath
 * @param {{ token?: string, apiHost?: string }} partial
 * @returns {Promise<string>} 写入的文件路径
 */
export async function mergeWriteBaklibJsonAt(filePath, partial) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  let cur = {};
  if (await pathIsFile(filePath)) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const j = JSON.parse(raw);
      if (j && typeof j === "object" && !Array.isArray(j)) {
        cur = { ...j };
      }
    } catch {
      /* empty */
    }
  }
  if (partial.token !== undefined) {
    cur.token = partial.token;
  }
  if (partial.apiHost !== undefined) {
    cur.apiHost = partial.apiHost;
  }
  await fs.writeFile(filePath, `${JSON.stringify(cur, null, 2)}\n`, "utf8");
  return filePath;
}

/**
 * 合并写入 ~/.config/baklib/baklib.json（保留文件中其它键）
 * @param {{ token?: string, apiHost?: string }} partial
 * @returns {Promise<string>} 写入的文件路径
 */
export async function mergeWriteUserBaklibJson(partial) {
  return mergeWriteBaklibJsonAt(getUserBaklibJsonPath(), partial);
}

/**
 * 写入项目级配置：若目录树中已有 `.baklib/baklib.json` 则更新该文件，否则使用 cwd 下 `.baklib/baklib.json`
 * @param {{ token?: string, apiHost?: string }} partial
 */
export async function mergeWriteProjectBaklibJson(partial, startDir = process.cwd()) {
  const p = await resolveWritableProjectBaklibJsonPath(startDir);
  return mergeWriteBaklibJsonAt(p, partial);
}

/**
 * @returns {Promise<string>} 将用于写入的项目 baklib.json 绝对路径
 */
export async function resolveWritableProjectBaklibJsonPath(startDir = process.cwd()) {
  const nearest = await findNearestBaklibJsonPath(startDir);
  if (nearest) {
    return nearest;
  }
  return path.join(path.resolve(startDir), BAKLIB_DIR, BAKLIB_JSON);
}

/**
 * 从 baklib.json 中移除凭据相关字段；若无剩余键则删除文件
 * @returns {Promise<{ path: string, cleared: boolean, removed?: boolean, skipped?: boolean }>}
 */
export async function resetBaklibJsonFile(filePath) {
  if (!(await pathIsFile(filePath))) {
    return { path: filePath, cleared: false, skipped: true };
  }
  let cur = {};
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const j = JSON.parse(raw);
    if (j && typeof j === "object" && !Array.isArray(j)) {
      cur = { ...j };
    }
  } catch {
    await fs.unlink(filePath);
    return { path: filePath, cleared: true, removed: true };
  }
  for (const k of BAKLIB_JSON_STRIP_KEYS) {
    delete cur[k];
  }
  const keys = Object.keys(cur);
  if (keys.length === 0) {
    await fs.unlink(filePath);
    return { path: filePath, cleared: true, removed: true };
  }
  await fs.writeFile(filePath, `${JSON.stringify(cur, null, 2)}\n`, "utf8");
  return { path: filePath, cleared: true, removed: false };
}

/** 清除用户级 ~/.config/baklib/baklib.json 中的凭据字段 */
export async function resetGlobalBaklibJson() {
  return resetBaklibJsonFile(getUserBaklibJsonPath());
}

/**
 * 清除项目级 baklib.json：优先向上找到的首个文件，否则处理 cwd 下 `.baklib/baklib.json`（须已存在）
 * @returns {Promise<{ ok: true, scope: 'project' } & Record<string, unknown>>}
 */
export async function resetProjectBaklibJson(startDir = process.cwd()) {
  const nearest = await findNearestBaklibJsonPath(startDir);
  const cwdPath = path.join(path.resolve(startDir), BAKLIB_DIR, BAKLIB_JSON);
  const target = nearest || ((await pathIsFile(cwdPath)) ? cwdPath : null);
  if (!target) {
    return {
      ok: true,
      scope: "project",
      cleared: false,
      skipped: true,
      note: "未找到项目 .baklib/baklib.json，未修改任何文件。清除用户级请执行：baklib config reset -g",
    };
  }
  const r = await resetBaklibJsonFile(target);
  return { ok: true, scope: "project", ...r };
}

/**
 * @returns {Promise<{ token: string, apiBase: string }>}
 */
export async function loadBaklibConfig() {
  /** @type {{ token: string, apiHost: string }} */
  const acc = { token: "", apiHost: "" };

  const userJsonPath = getUserBaklibJsonPath();
  applyBaklibJsonPatch(acc, await readBaklibJsonFile(userJsonPath));

  const nearestJson = await findNearestBaklibJsonPath();
  if (nearestJson) {
    applyBaklibJsonPatch(acc, await readBaklibJsonFile(nearestJson));
  }

  const wsRoot = LEGACY_WS_ENV_KEYS.map((k) => (process.env[k] || "").trim()).find(Boolean) || "";
  if (wsRoot) {
    const legacyConfigDir = path.join(path.resolve(wsRoot), ".config");
    if (await pathIsDir(legacyConfigDir)) {
      if (!acc.token) {
        acc.token = (await readFirstFromDir(legacyConfigDir, LEGACY_WS_TOKEN_FILES)) || "";
      }
      if (!acc.apiHost) {
        acc.apiHost = (await readFirstFromDir(legacyConfigDir, LEGACY_WS_API_BASE_FILES)) || "";
      }
    }
  }

  const flatUserConfig = path.join(os.homedir(), ".config");
  if (await pathIsDir(flatUserConfig)) {
    if (!acc.token) {
      acc.token = (await readFirstFromDir(flatUserConfig, LEGACY_USER_TOKEN_FILES)) || "";
    }
    if (!acc.apiHost) {
      acc.apiHost = (await readFirstFromDir(flatUserConfig, LEGACY_USER_API_BASE_FILES)) || "";
    }
  }

  const envToken = ENV_TOKEN_KEYS.map((k) => (process.env[k] || "").trim()).find(Boolean) || "";
  const envApiBase = ENV_API_BASE_KEYS.map((k) => (process.env[k] || "").trim()).find(Boolean) || "";
  if (envToken) {
    acc.token = envToken;
  }
  if (envApiBase) {
    acc.apiHost = envApiBase;
  }

  const resolvedApiBase = resolveOpenApiBaseUrl(acc.apiHost);

  return { token: acc.token, apiBase: resolvedApiBase };
}

export function requireToken(config) {
  if (!config.token) {
    throw new Error(
      "未配置 Token：请设置环境变量 BAKLIB_TOKEN，或写入 ~/.config/baklib/baklib.json（及项目内 .baklib/baklib.json）。若尚未迁移，仍可尝试工作区 .config/ 或 ~/.config/ 下旧式凭据文件。",
    );
  }
}
