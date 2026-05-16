import { injectPreviewLiveReloadScript } from "./preview-live-reload.js";

/**
 * 将服务端返回 HTML 中指向主题静态资源的路径改写到本地 __theme_asset。
 * 规则保守：明显主题 assets；以及预览阶段将外链 https 改写到同源 __baklib_proxy。
 *
 * @param {string} html
 * @returns {string}
 */
export function rewriteThemeHtmlForLocalAssets(html) {
  if (typeof html !== "string" || !html) return html;
  return html
    .replace(/\b(href|src|poster)=(["'])\/assets\//gi, "$1=$2/__theme_asset/assets/")
    .replace(/\b(href|src|poster)=(["'])assets\//gi, "$1=$2/__theme_asset/assets/")
    .replace(/\burl\(\s*(["']?)\/assets\//gi, "url($1/__theme_asset/assets/")
    .replace(/\burl\(\s*(["']?)assets\//gi, "url($1/__theme_asset/assets/");
}

const PROXY_PREFIX = "/__baklib_proxy?url=";

/**
 * @param {string} raw
 * @returns {string | null} theme-relative path under assets/ (no leading slash) or null
 */
export function themeAssetRelFromUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const u = s.startsWith("//") ? new URL(`https:${s}`) : new URL(s);
    const p = u.pathname || "";
    if (p.startsWith("/assets/")) return p.slice("/assets/".length);
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {string} absUrl
 */
function toProxyParam(absUrl) {
  return `${PROXY_PREFIX}${encodeURIComponent(absUrl)}`;
}

/**
 * 将绝对 https URL（含 // 协议相对）中路径为 /assets/ 的改写到 __theme_asset；其余 https 改写到 __baklib_proxy。
 * 跳过已是 __theme_asset、__baklib_proxy、data:、mailto:、javascript: 的引用。
 *
 * @param {string} html
 * @returns {string}
 */
export function rewriteHttpsForPreviewProxy(html) {
  if (typeof html !== "string" || !html) return html;

  // href / src / poster (double or single quoted)
  html = html.replace(/\b(href|src|poster)=(["'])(https:\/\/[^"'>\s]+)\2/gi, (full, name, q, url) => {
    if (url.includes("/__baklib_proxy") || url.includes("/__theme_asset")) return full;
    const rel = themeAssetRelFromUrl(url);
    if (rel != null) return `${name}=${q}/__theme_asset/assets/${rel}${q}`;
    return `${name}=${q}${toProxyParam(url)}${q}`;
  });
  html = html.replace(/\b(href|src|poster)=(["'])(\/\/[^"'>\s]+)\2/gi, (full, name, q, url) => {
    if (url.includes("/__baklib_proxy") || url.includes("/__theme_asset")) return full;
    const abs = `https:${url}`;
    const rel = themeAssetRelFromUrl(abs);
    if (rel != null) return `${name}=${q}/__theme_asset/assets/${rel}${q}`;
    return `${name}=${q}${toProxyParam(abs)}${q}`;
  });

  // url() in CSS
  html = html.replace(/\burl\(\s*(["']?)(https:\/\/[^)'"\s]+)\1\s*\)/gi, (full, q, url) => {
    if (url.includes("/__baklib_proxy") || url.includes("/__theme_asset")) return full;
    const rel = themeAssetRelFromUrl(url);
    if (rel != null) return `url(${q}/__theme_asset/assets/${rel}${q})`;
    return `url(${q}${toProxyParam(url)}${q})`;
  });
  html = html.replace(/\burl\(\s*(["']?)(\/\/[^)'"\s]+)\1\s*\)/gi, (full, q, url) => {
    const abs = `https:${url}`;
    const rel = themeAssetRelFromUrl(abs);
    if (rel != null) return `url(${q}/__theme_asset/assets/${rel}${q})`;
    return `url(${q}${toProxyParam(abs)}${q})`;
  });

  // srcset: "url 1x, url 2x"
  html = html.replace(/\bsrcset=(["'])([^"']+)\1/gi, (full, q, inner) => {
    const parts = inner.split(",").map((s) => s.trim());
    const out = parts
      .map((part) => {
        const sp = part.split(/\s+/);
        const url = sp[0];
        const desc = sp.slice(1).join(" ");
        if (!url) return part;
        if (url.startsWith("/__theme_asset/") || url.startsWith("/__baklib_proxy")) return part;
        let abs = url;
        if (url.startsWith("//")) abs = `https:${url}`;
        else if (!url.startsWith("https://")) return part;
        const rel = themeAssetRelFromUrl(abs);
        let mapped;
        try {
          mapped = rel != null ? `/__theme_asset/assets/${rel}` : toProxyParam(new URL(abs).href);
        } catch {
          return part;
        }
        return desc ? `${mapped} ${desc}` : mapped;
      })
      .join(", ");
    return `srcset=${q}${out}${q}`;
  });

  return html;
}

/**
 * @param {string} html
 * @returns {string}
 */
export function rewritePreviewHtml(html) {
  let out = rewriteThemeHtmlForLocalAssets(html);
  out = rewriteHttpsForPreviewProxy(out);
  out = injectPreviewLiveReloadScript(out);
  return out;
}
