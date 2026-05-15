import fs from "node:fs/promises";
import path from "node:path";

const MANUAL_PREFIXES = ["snippets/", "templates/", "layout/", "layouts/", "statics/"];

/**
 * @param {string} rel
 */
export function isManualSyncTemplatePath(rel) {
  const n = String(rel || "").replace(/\\/g, "/").replace(/^\//, "");
  if (!n || n.includes("..")) return false;
  if (!n.endsWith(".liquid")) return false;
  return MANUAL_PREFIXES.some((p) => n.startsWith(p));
}

/**
 * @param {string} themeRoot
 * @returns {Promise<string[]>} 如 en、zh-CN（来自 locales/*.json，不含 *.schema.json）
 */
export async function listThemeLocaleTags(themeRoot) {
  const root = path.resolve(themeRoot);
  const locDir = path.join(root, "locales");
  let names = [];
  try {
    names = await fs.readdir(locDir);
  } catch {
    return ["zh-CN"];
  }
  const tags = new Set();
  for (const name of names) {
    if (!name.endsWith(".json") || name.endsWith(".schema.json")) continue;
    const base = name.slice(0, -".json".length);
    if (base) tags.add(base);
  }
  const arr = [...tags];
  if (!arr.length) return ["zh-CN"];
  arr.sort((a, b) => a.localeCompare(b));
  return arr;
}

/**
 * @param {string} themeRoot
 * @returns {Promise<string[]>} 相对路径，已排序
 */
export async function listManualSyncTemplatePaths(themeRoot) {
  const root = path.resolve(themeRoot);
  const out = [];
  for (const sub of ["snippets", "templates", "layout", "layouts", "statics"]) {
    const base = path.join(root, sub);
    let st;
    try {
      st = await fs.stat(base);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    await walkLiquid(base, root, out);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

/**
 * @param {string} themeRoot
 * @returns {Promise<string[]>} 不含 .liquid 的模板名（templates 目录）
 */
export async function listTemplateBasenames(themeRoot) {
  const root = path.resolve(themeRoot);
  const dir = path.join(root, "templates");
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return ["index", "page"];
  }
  const bases = names
    .filter((n) => n.endsWith(".liquid"))
    .map((n) => n.replace(/\.liquid$/i, ""))
    .filter(Boolean);
  bases.sort((a, b) => a.localeCompare(b));
  return bases.length ? bases : ["index", "page"];
}

/**
 * @param {string} dir
 * @param {string} themeRoot
 * @param {string[]} acc
 */
async function walkLiquid(dir, themeRoot, acc) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walkLiquid(full, themeRoot, acc);
    } else if (ent.isFile() && ent.name.endsWith(".liquid")) {
      const rel = path.relative(themeRoot, full).replace(/\\/g, "/");
      if (isManualSyncTemplatePath(rel)) acc.push(rel);
    }
  }
}
