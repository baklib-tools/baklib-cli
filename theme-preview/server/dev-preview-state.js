import { randomUUID } from "node:crypto";

const COOKIE = "baklib_theme_dev_id";
/** @type {Map<string, any>} */
const store = new Map();

/** @param {string} id */
export function getDevState(id) {
  return store.get(id) || null;
}

/**
 * @param {string} id
 * @param {any} state
 */
export function setDevState(id, state) {
  store.set(id, state);
}

/**
 * 与 POST /api/baklib/dev-state 合并（未给出的键保留原值）
 * @param {string} id
 * @param {any} patch
 */
export function mergeDevState(id, patch) {
  const prev = getDevState(id) || defaultState();
  const next = { ...prev, ...patch };
  if (patch.siteId !== undefined && patch.siteId !== prev.siteId && patch.remotePages === undefined) {
    next.remotePages = [];
  }
  if (patch.siteId !== undefined && patch.siteId !== prev.siteId && patch.remotePagesSummary === undefined) {
    next.remotePagesSummary = [];
  }
  if (patch.siteId !== undefined && patch.siteId !== prev.siteId && patch.remoteTemplateVarsUserSavedIds === undefined) {
    next.remoteTemplateVarsUserSavedIds = [];
  }
  if (patch.siteId !== undefined && patch.siteId !== prev.siteId && patch.portalUrl === undefined) {
    next.portalUrl = "";
  }
  store.set(id, next);
  return next;
}

export function devCookieName() {
  return COOKIE;
}

/** @param {string | undefined} cookieHeader */
export function readDevIdFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((s) => s.trim());
  for (const p of parts) {
    if (p.startsWith(`${COOKIE}=`)) {
      const v = decodeURIComponent(p.slice(COOKIE.length + 1).trim());
      return v || null;
    }
  }
  return null;
}

/** @param {string} id */
export function setDevCookieHeader(id) {
  const maxAge = 60 * 60 * 24 * 30;
  return `${COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function ensureDevId(cookieHeader) {
  const existing = readDevIdFromCookie(cookieHeader);
  if (existing && store.has(existing)) return { id: existing, setCookie: null };
  if (existing) {
    store.set(existing, defaultState());
    return { id: existing, setCookie: null };
  }
  const id = randomUUID();
  store.set(id, defaultState());
  return { id, setCookie: setDevCookieHeader(id) };
}

function defaultState() {
  return {
    siteId: "",
    portalUrl: "",
    remotePages: [],
    remotePagesSummary: [],
    localPages: [],
    pageTextSettings: {},
    pageTextSettingsBaseline: {},
    previewLocale: "zh-CN",
    previewSyncManualPaths: [],
    remotePathOverrides: {},
    remotePathOverridesBaseline: {},
    remoteTemplateVarsUserSavedIds: [],
  };
}

/**
 * @param {string} path
 */
export function normalizePreviewPath(path) {
  let s = String(path || "/").split("?")[0] || "/";
  s = s.startsWith("/") ? s : `/${s}`;
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s || "/";
}

/**
 * 深度合并 template_variables：对象递归，数组与标量以 patch 为准。
 * @param {unknown} base
 * @param {unknown} patch
 */
export function deepMergeTemplateVariables(base, patch) {
  if (patch === null || patch === undefined) {
    if (base && typeof base === "object" && !Array.isArray(base)) {
      return { ...(/** @type {Record<string, unknown>} */ (base)) };
    }
    return {};
  }
  if (Array.isArray(patch)) return patch;
  if (typeof patch !== "object") return patch;
  const b = base && typeof base === "object" && !Array.isArray(base) ? /** @type {Record<string, unknown>} */ (base) : {};
  const p = /** @type {Record<string, unknown>} */ (patch);
  const out = { ...b };
  for (const k of Object.keys(p)) {
    const pv = p[k];
    const bv = out[k];
    if (pv && typeof pv === "object" && !Array.isArray(pv) && bv && typeof bv === "object" && !Array.isArray(bv)) {
      out[k] = deepMergeTemplateVariables(bv, pv);
    } else {
      out[k] = pv;
    }
  }
  return out;
}

/**
 * @param {any} state
 * @param {string} pathNorm
 */
export function findRemotePageSummaryRow(state, pathNorm) {
  const summaries = Array.isArray(state.remotePagesSummary) ? state.remotePagesSummary : [];
  return summaries.find((r) => normalizePreviewPath(String(r.path || "/")) === pathNorm) || null;
}

/**
 * 稳定序列化 template_variables，仅用于与列表行对比是否「真有编辑」。
 * @param {unknown} v
 */
function stableStringifyTemplateVars(v) {
  const walk = (x) => {
    if (x === null || x === undefined) return null;
    if (typeof x !== "object") return x;
    if (Array.isArray(x)) return x.map(walk);
    const keys = Object.keys(x).sort();
    const o = {};
    for (const k of keys) {
      o[k] = walk(x[k]);
    }
    return o;
  };
  try {
    const base = v && typeof v === "object" && !Array.isArray(v) ? v : {};
    return JSON.stringify(walk(base));
  } catch {
    return "{}";
  }
}

/**
 * 当前请求 path 若对应面板中的本地虚拟页，则返回 `preview_render` 所需的 `local_page` 对象；否则 `null`（远端页由服务端按 full_path 查库）。
 * 远端页：仅当存在**真实覆盖**（与列表不一致的 template_variables、或覆盖模版名、或非空正文）时才返回 `local_page`。
 * 若仅把列表 API 同步下来的 variables 原样再发回去并带 `content: ""`，服务端会按「本地页」处理，正文/图片/发布时间等会丢失。
 * 变量有改动时，此处将**列表行**上的 `template_variables` 与面板编辑值做深度合并；`preview_render` 调用前再由中间件用 **GET 单页** 补全正文、访问量等字段（见 `preview-local-page-enrich.js`）。
 * @param {any} state
 * @param {string} pathNorm `normalizePreviewPath` 结果
 */
export function buildPreviewLocalPageForPath(state, pathNorm) {
  for (const lp of state.localPages || []) {
    if (normalizePreviewPath(lp.path) === pathNorm) {
      const key = `local:${lp.localKey}`;
      const textMap = state.pageTextSettings?.[key];
      const template_variables =
        textMap && typeof textMap === "object" && !Array.isArray(textMap) ? textMap : {};
      return {
        template_name: lp.template_name,
        name: lp.name || lp.path,
        path: pathNorm,
        content: lp.content || "",
        template_variables,
      };
    }
  }

  const row = findRemotePageSummaryRow(state, pathNorm);
  if (!row) return null;

  const idStr = String(row.id || "");
  const textKey = `remote:${idStr}`;
  const tv = state.pageTextSettings?.[textKey];
  const template_variables =
    tv && typeof tv === "object" && !Array.isArray(tv) ? { ...tv } : {};

  const ovRaw = state.remotePathOverrides?.[pathNorm];
  const ov = ovRaw && typeof ovRaw === "object" && !Array.isArray(ovRaw) ? ovRaw : {};
  const template_from_ov = typeof ov.template_name === "string" ? ov.template_name.trim() : "";
  const baseTpl = String(row.template_name || "page").trim() || "page";
  const template_name = template_from_ov || baseTpl;

  const rowVars =
    row.template_variables && typeof row.template_variables === "object" && !Array.isArray(row.template_variables)
      ? row.template_variables
      : {};
  const varsChanged = stableStringifyTemplateVars(rowVars) !== stableStringifyTemplateVars(template_variables);
  const hasTplOverride = Boolean(template_from_ov);
  const contentOverride = typeof ov.content === "string" && ov.content.length > 0;

  if (!varsChanged && !hasTplOverride && !contentOverride) return null;

  /** @type {Record<string, unknown>} */
  const out = {
    template_name,
    name: String(row.name || pathNorm),
  };
  if (varsChanged) out.template_variables = deepMergeTemplateVariables(rowVars, template_variables);
  if (contentOverride) out.content = ov.content;
  return out;
}
