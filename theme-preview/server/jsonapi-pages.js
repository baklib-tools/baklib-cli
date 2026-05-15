/**
 * JSON:API 资源属性兼容（Baklib AMS 常输出 dasherize 键名）
 * @param {Record<string, unknown> | undefined} attrs
 * @param {string} snakeKey
 */
export function pickJsonApiAttr(attrs, snakeKey) {
  if (!attrs || typeof attrs !== "object") return undefined;
  const dashed = snakeKey.replace(/_/g, "-");
  const v = attrs[snakeKey];
  if (v !== undefined && v !== null) return v;
  return attrs[dashed];
}

/**
 * @param {unknown} body
 * @returns {any[]}
 */
export function jsonApiDataArray(body) {
  if (body == null) return [];
  const d = body.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") return [d];
  return [];
}

/**
 * @param {any} row
 */
export function parentIdFromJsonApiRow(row) {
  const a = row.attributes || {};
  const fromAttr = pickJsonApiAttr(a, "parent_id");
  if (fromAttr != null && fromAttr !== "") return String(fromAttr);
  const rel = row.relationships?.parent?.data;
  if (rel && rel.id != null && rel.id !== "") return String(rel.id);
  return null;
}

function normalizePreviewPathSegment(p) {
  let s = String(p || "/").trim();
  if (!s.startsWith("/")) s = `/${s}`;
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s || "/";
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function pathnameFromMaybeUrl(raw) {
  const s = String(raw || "").trim();
  if (!s || (!s.startsWith("http://") && !s.startsWith("https://"))) return null;
  try {
    const u = new URL(s);
    const p = u.pathname || "/";
    return p;
  } catch {
    return null;
  }
}

/**
 * 首页在 Open API 里常见 slug 为 home/index，而浏览器与 preview_render 请求路径为 `/`。
 * @param {string} path
 * @param {string} templateName
 */
function normalizeHomePagePathForPreview(path, templateName) {
  let p = normalizePreviewPathSegment(path);
  const tn = String(templateName || "").toLowerCase();
  if (tn === "index" || tn === "home") {
    if (p === "/home" || p === "/index" || p === "/welcome" || p === "" || p === "/") {
      return "/";
    }
  }
  return p;
}

/**
 * Open API pages 列表行 → 面板 / 预览用行（`id` 优先为 attributes.hashid，供 preview_render 的 page_id）
 * @param {any[]} rows
 */
export function jsonApiRowsToRemotePageRows(rows) {
  const rowsArr = Array.isArray(rows) ? rows : [];
  /** 数字主键 → Hashid（同次响应内建映射，用于 parent_id） */
  const pkToHashid = new Map();
  for (const row of rowsArr) {
    const a = row.attributes || {};
    const hid = pickJsonApiAttr(a, "hashid");
    const pk = String(row.id);
    pkToHashid.set(pk, typeof hid === "string" && hid.trim() ? hid.trim() : pk);
  }

  return rowsArr.map((row) => {
    const a = row.attributes || {};
    const fullPath = pickJsonApiAttr(a, "full_path");
    const pathAttr = pickJsonApiAttr(a, "path");
    const permalink = pickJsonApiAttr(a, "permalink");
    const urlAttr = pickJsonApiAttr(a, "url");
    const linkUrl = pickJsonApiAttr(a, "link_url");
    const slug = pickJsonApiAttr(a, "slug");
    const fromUrl = pathnameFromMaybeUrl(urlAttr) || pathnameFromMaybeUrl(linkUrl);
    const rawPath =
      fullPath ||
      pathAttr ||
      permalink ||
      fromUrl ||
      (slug ? `/${String(slug).replace(/^\//, "")}` : "/");
    const name = pickJsonApiAttr(a, "name") || pickJsonApiAttr(a, "calculated_link_text") || String(row.id);
    const template_name = pickJsonApiAttr(a, "template_name") || "page";
    const path = normalizeHomePagePathForPreview(rawPath, template_name ? String(template_name) : "page");
    const rawParent = parentIdFromJsonApiRow(row);
    const parent_id =
      rawParent != null && rawParent !== ""
        ? (pkToHashid.get(String(rawParent)) ?? String(rawParent))
        : null;
    const rowHash = pickJsonApiAttr(a, "hashid");
    const id = typeof rowHash === "string" && rowHash.trim() ? rowHash.trim() : String(row.id);
    const tvRaw = pickJsonApiAttr(a, "template_variables");
    let template_variables = undefined;
    if (tvRaw != null && typeof tvRaw === "object" && !Array.isArray(tvRaw)) {
      template_variables = tvRaw;
    }
    return {
      id,
      path,
      name,
      parent_id,
      template_name: template_name ? String(template_name) : "page",
      ...(template_variables !== undefined ? { template_variables } : {}),
    };
  });
}
