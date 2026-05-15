import path from "node:path";
import fs from "node:fs/promises";

/**
 * 将 `statics/` 下 `.liquid` 文件映射为门户静态页路径 `/s/<slug>`，
 * 与 Baklib 主题约定一致（`statics/page/nav_tree.liquid` → `/s/page/nav_tree`）。
 *
 * @param {string} themeDir 主题根目录（绝对路径）
 * @returns {Promise<{ path: string, rel: string, slug: string }[]>}
 */
export async function listThemeStaticPreviewRoutes(themeDir) {
  const root = path.resolve(themeDir);
  const staticsDir = path.join(root, "statics");
  try {
    const st = await fs.stat(staticsDir);
    if (!st.isDirectory()) return [];
  } catch {
    return [];
  }

  /** @type {string[]} */
  const liquidRelUnderStatics = [];

  /**
   * @param {string} dirAbs
   */
  async function walk(dirAbs) {
    let entries;
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dirAbs, ent.name);
      const relUnderStatics = path.relative(staticsDir, full).replace(/\\/g, "/");
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile() && /\.liquid$/i.test(ent.name)) {
        liquidRelUnderStatics.push(relUnderStatics);
      }
    }
  }

  await walk(staticsDir);

  /** @type {{ path: string, rel: string, slug: string }[]} */
  const out = [];
  for (const rel of liquidRelUnderStatics) {
    const slug = rel.replace(/\.liquid$/i, "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!slug) continue;
    const urlPath = `/s/${slug}`;
    out.push({
      path: urlPath.length > 1 && urlPath.endsWith("/") ? urlPath.slice(0, -1) : urlPath,
      rel: `statics/${rel}`.replace(/\\/g, "/"),
      slug,
    });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
