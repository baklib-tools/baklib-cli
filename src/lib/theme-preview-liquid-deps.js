import fs from "fs/promises";
import path from "path";
import { THEME_PREVIEW_MAX_FILES, THEME_PREVIEW_MAX_FILE_BYTES, THEME_PREVIEW_MAX_TOTAL_BYTES } from "./theme-preview-constants.js";
import { normalizeLocaleTag } from "./theme-preview-locale.js";

const RENDER_RE = /\{%-?\s*render\s+["']([^"']+)["']/gi;
const INCLUDE_RE = /\{%-?\s*include\s+["']([^"']+)["']/gi;
const SECTION_RE = /\{%-?\s*section\s+["']([^"']+)["']/gi;

/**
 * @param {string} ref
 * @returns {string[]}
 */
export function liquidRefToCandidatePaths(ref) {
  const r = String(ref || "").trim();
  if (!r) return [];

  if (r.endsWith(".liquid")) {
    const clean = r.replace(/^\//, "");
    if (/^(layout|templates|snippets|sections|statics)\//.test(clean)) return [clean];
    return [clean];
  }

  if (r.startsWith("snippets/")) {
    const rest = r.slice("snippets/".length);
    if (rest.endsWith(".liquid")) return [`snippets/${rest}`];
    const base = path.posix.basename(rest);
    const dir = path.posix.dirname(rest);
    if (base.startsWith("_")) return [dir === "." ? `snippets/${base}.liquid` : `snippets/${dir}/${base}.liquid`];
    if (dir === ".") return [`snippets/_${base}.liquid`];
    return [`snippets/${dir}/_${base}.liquid`];
  }

  if (r.startsWith("sections/")) {
    const tail = r.slice("sections/".length).replace(/\.liquid$/, "");
    return [`sections/${tail}.liquid`];
  }

  if (r.startsWith("templates/")) {
    const tail = r.slice("templates/".length).replace(/\.liquid$/, "");
    return [`templates/${tail}.liquid`];
  }

  if (r.startsWith("layout/")) {
    const tail = r.slice("layout/".length).replace(/\.liquid$/, "");
    return [`layout/${tail}.liquid`];
  }

  return [`snippets/_${r.replace(/\.liquid$/, "")}.liquid`];
}

/**
 * @param {string} source
 * @returns {string[]}
 */
export function extractLayoutNames(source) {
  const names = [];
  const re = /\{%-?\s*layout\s+["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(String(source || ""))) !== null) names.push(m[1].trim());
  return names;
}

/**
 * @param {string} source
 * @returns {string[]}
 */
export function extractNonLayoutRefs(source) {
  const text = String(source || "");
  const out = new Set();
  const run = (re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) out.add(m[1].trim());
  };
  run(RENDER_RE);
  run(INCLUDE_RE);
  run(SECTION_RE);
  return [...out];
}

/**
 * @param {string} themeRoot
 * @param {string} relPath
 */
async function fileExists(themeRoot, relPath) {
  const full = path.join(themeRoot, relPath);
  try {
    const st = await fs.stat(full);
    return st.isFile();
  } catch {
    return false;
  }
}

/**
 * @param {string} themeRoot
 * @param {string} ref
 */
async function resolveRefToExistingPath(themeRoot, ref) {
  for (const c of liquidRefToCandidatePaths(ref)) {
    if (await fileExists(themeRoot, c)) return c;
  }
  return null;
}

/**
 * @param {string} themeRoot
 * @param {string} layoutName
 */
async function resolveLayoutPath(themeRoot, layoutName) {
  const name = String(layoutName || "").trim();
  if (!name || name.toLowerCase() === "none") return null;
  const rel = `layout/${name}.liquid`;
  return (await fileExists(themeRoot, rel)) ? rel : null;
}

/**
 * BFS 收集 .liquid 依赖（含 layout），超过 maxFiles 抛错
 * @param {{ themeRoot: string, entryRel: string, maxFiles?: number }} opts
 * @returns {Promise<string[]>}
 */
export async function collectLiquidDependencyPaths(opts) {
  const themeRoot = path.resolve(opts.themeRoot);
  const entryRel = String(opts.entryRel || "").replace(/\\/g, "/").replace(/^\//, "");
  const maxFiles = opts.maxFiles ?? THEME_PREVIEW_MAX_FILES;

  if (!(await fileExists(themeRoot, entryRel))) {
    throw new Error(`入口模板不存在: ${entryRel}`);
  }

  const visited = new Set();
  const ordered = [];
  const queue = [entryRel];

  while (queue.length) {
    const rel = /** @type {string} */ (queue.shift());
    if (!rel || visited.has(rel)) continue;
    visited.add(rel);
    ordered.push(rel);

    if (ordered.length > maxFiles) {
      throw new Error(
        `主题预览同步依赖超过 ${maxFiles} 个文件（含入口）。请缩小入口模板或减少 include/render/layout/section 引用。\n已收集: ${ordered.join(", ")}`,
      );
    }

    const source = await fs.readFile(path.join(themeRoot, rel), "utf8");

    for (const ln of extractLayoutNames(source)) {
      const lp = await resolveLayoutPath(themeRoot, ln);
      if (lp && !visited.has(lp)) queue.push(lp);
    }

    for (const ref of extractNonLayoutRefs(source)) {
      const resolved = await resolveRefToExistingPath(themeRoot, ref);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }

  return ordered;
}

/**
 * @param {string} themeRoot
 * @param {string} rel
 */
export async function readThemeTextFile(themeRoot, rel) {
  const buf = await fs.readFile(path.join(themeRoot, rel));
  if (buf.includes(0)) {
    throw new Error(`文件含空字节，无法同步: ${rel}`);
  }
  if (buf.length > THEME_PREVIEW_MAX_FILE_BYTES) {
    throw new Error(`文件超过 ${THEME_PREVIEW_MAX_FILE_BYTES} 字节: ${rel}`);
  }
  let s;
  try {
    s = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    throw new Error(`文件不是合法 UTF-8: ${rel}`);
  }
  return s;
}

/**
 * @param {{ themeRoot: string, entryRel: string, locale: string, includeSettingsSchema?: boolean, maxFiles?: number }} opts
 * @returns {Promise<Record<string, string>>}
 */
export async function buildThemePreviewFilesMap(opts) {
  const themeRoot = path.resolve(opts.themeRoot);
  const locale = normalizeLocaleTag(String(opts.locale || "zh-CN"));
  const maxFiles = opts.maxFiles ?? THEME_PREVIEW_MAX_FILES;
  const includeSettingsSchema = opts.includeSettingsSchema !== false;

  const extras = [];
  const locJson = `locales/${locale}.json`;
  const locSchema = `locales/${locale}.schema.json`;
  if (await fileExists(themeRoot, locJson)) extras.push(locJson);
  if (await fileExists(themeRoot, locSchema)) extras.push(locSchema);
  if (includeSettingsSchema && (await fileExists(themeRoot, "config/settings_schema.json"))) {
    extras.push("config/settings_schema.json");
  }

  const reserved = extras.length;
  const liquidCap = Math.max(1, maxFiles - reserved);

  const liquidPaths = await collectLiquidDependencyPaths({
    themeRoot,
    entryRel: opts.entryRel,
    maxFiles: liquidCap,
  });

  const allPaths = [...liquidPaths, ...extras];
  if (allPaths.length > maxFiles) {
    throw new Error(
      `加上语言包与 config 后共 ${allPaths.length} 个文件，超过单次同步上限 ${maxFiles}。\n路径: ${allPaths.join(", ")}`,
    );
  }

  /** @type {Record<string, string>} */
  const files = {};
  let total = 0;
  for (const rel of allPaths) {
    const body = await readThemeTextFile(themeRoot, rel);
    total += Buffer.byteLength(body, "utf8");
    if (total > THEME_PREVIEW_MAX_TOTAL_BYTES) {
      throw new Error(`同步总大小超过 ${THEME_PREVIEW_MAX_TOTAL_BYTES} 字节`);
    }
    files[rel] = body;
  }
  return files;
}

const MANUAL_SYNC_PREFIXES = ["snippets/", "templates/", "layout/", "layouts/", "statics/"];

/**
 * @param {string} rel
 */
export function assertManualSyncLiquidPath(rel) {
  const n = String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\//, "");
  if (!n || n.includes("..") || !n.endsWith(".liquid")) {
    throw new Error(`非法的手动同步路径: ${rel}`);
  }
  if (!MANUAL_SYNC_PREFIXES.some((p) => n.startsWith(p))) {
    throw new Error(`手动同步仅允许 ${MANUAL_SYNC_PREFIXES.join("、")} 下的 .liquid 文件`);
  }
  return n;
}

/**
 * 仅上传用户勾选的 Liquid 路径 + locales + settings_schema（受单次文件数与总字节上限约束）。
 * @param {{ themeRoot: string, locale: string, manualLiquidPaths: string[], includeSettingsSchema?: boolean, maxFiles?: number }} opts
 * @returns {Promise<Record<string, string>>}
 */
export async function buildThemePreviewFilesMapFromManualPaths(opts) {
  const themeRoot = path.resolve(opts.themeRoot);
  const locale = normalizeLocaleTag(String(opts.locale || "zh-CN"));
  const maxFiles = opts.maxFiles ?? THEME_PREVIEW_MAX_FILES;
  const includeSettingsSchema = opts.includeSettingsSchema !== false;

  const seen = new Set();
  const liquidRels = [];
  for (const raw of opts.manualLiquidPaths || []) {
    const n = assertManualSyncLiquidPath(raw);
    if (seen.has(n)) continue;
    seen.add(n);
    if (!(await fileExists(themeRoot, n))) {
      throw new Error(`主题中不存在文件: ${n}`);
    }
    liquidRels.push(n);
  }

  const extras = [];
  const locJson = `locales/${locale}.json`;
  const locSchema = `locales/${locale}.schema.json`;
  if (await fileExists(themeRoot, locJson)) extras.push(locJson);
  if (await fileExists(themeRoot, locSchema)) extras.push(locSchema);
  if (includeSettingsSchema && (await fileExists(themeRoot, "config/settings_schema.json"))) {
    extras.push("config/settings_schema.json");
  }

  const allPaths = [...liquidRels, ...extras];
  if (allPaths.length > maxFiles) {
    throw new Error(
      `手动勾选 ${liquidRels.length} 个模板文件，加上语言包与 config 后共 ${allPaths.length} 个文件，超过单次同步上限 ${maxFiles}。请减少勾选或拆分同步。`,
    );
  }

  /** @type {Record<string, string>} */
  const files = {};
  let total = 0;
  for (const rel of allPaths) {
    const body = await readThemeTextFile(themeRoot, rel);
    total += Buffer.byteLength(body, "utf8");
    if (total > THEME_PREVIEW_MAX_TOTAL_BYTES) {
      throw new Error(`同步总大小超过 ${THEME_PREVIEW_MAX_TOTAL_BYTES} 字节`);
    }
    files[rel] = body;
  }
  return files;
}
