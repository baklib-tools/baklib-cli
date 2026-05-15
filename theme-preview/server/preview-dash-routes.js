/**
 * 与 Baklib `ThemePreview::PreviewRender#try_render_portal_scope_path!` 中处理的
 * `config/routes/site_portal.rb` scope '-' Liquid 页路径保持一致。
 * 其余 `/-/…`（如 active_storage、theme-assets、dam 等）由开发服向门户回源。
 */

/** @param {string} urlPath path 或带 query 的 raw 片段 */
export function normalizeDashPathForMatch(urlPath) {
  let p = String(urlPath || "/").split("?")[0] || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

/**
 * 此类路径在启用预览会话时应走 Open API preview_render（本地 DevCache 主题），
 * 不向门户做静态回源。
 * @param {string} urlPath
 */
export function isPreviewRenderDashScopePath(urlPath) {
  const p = normalizeDashPathForMatch(urlPath);
  if (p === "/-/search") return true;
  if (p === "/-/nav_tree") return true;
  if (p === "/-/feedback/new") return true;
  if (/^\/-\/tags\/[^/]+$/.test(p)) return true;
  return false;
}
