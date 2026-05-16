/**
 * 解析门户 `/-/theme-assets/{token}--{sig}/…` 路径，得到主题 `assets/` 下相对路径。
 *
 * token 为 base64url(JSON)，含 `path`（相对 assets/，如 `stylesheets/application.css`）。
 * URL 末尾路径段通常与 `path` 一致，以 token 内字段为准。
 *
 * @param {string} urlPath pathname（无 query）
 * @returns {string | null} assets 下相对路径，非法或无法解析时返回 null
 */
export function themeAssetRelFromThemeAssetsDashPath(urlPath) {
  const p = String(urlPath || "").split("?")[0] || "";
  const m = p.match(/^\/-\/theme-assets\/([^/]+)(?:\/(.*))?$/);
  if (!m) return null;

  const tokenSeg = m[1];
  const trail = m[2] != null ? String(m[2]) : "";
  const sep = tokenSeg.indexOf("--");
  if (sep <= 0) return null;
  const payloadB64 = tokenSeg.slice(0, sep);
  if (!/^[A-Za-z0-9_-]+$/.test(payloadB64)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const rel = typeof payload?.path === "string" ? payload.path.trim() : "";
  if (!rel || rel.startsWith("/") || rel.includes("..") || rel.includes("\\")) return null;

  if (trail) {
    const t = trail.replace(/\\/g, "/");
    if (t.startsWith("/") || t.includes("..")) return null;
    if (t !== rel) return null;
  }

  return rel;
}

/**
 * @param {string} urlPath
 */
export function isThemeAssetsDashPath(urlPath) {
  return themeAssetRelFromThemeAssetsDashPath(urlPath) != null;
}
