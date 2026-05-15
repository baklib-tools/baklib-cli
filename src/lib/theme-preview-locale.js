/**
 * 规范化 locale 标签为 locales 文件名形式（与 baklib ThemeEngine::FileInfo 一致：如 en、zh-CN）
 * @param {string} raw
 */
export function normalizeLocaleTag(raw) {
  let s = String(raw || "").trim();
  if (!s) return "zh-CN";
  s = s.split(".")[0].split("@")[0].replace(/_/g, "-");
  const m = s.match(/^([a-zA-Z]{2,3})(?:-([A-Za-z]{2,4}|[0-9]{3}))?$/);
  if (!m) return "zh-CN";
  const lang = m[1].toLowerCase();
  if (!m[2]) return lang;
  const rest = m[2];
  if (rest.length === 2 && /^[a-z]{2}$/i.test(rest)) return `${lang}-${rest.toUpperCase()}`;
  return `${lang}-${rest.toLowerCase()}`;
}

/**
 * 未传 --locale 时从环境变量推导，失败默认 zh-CN
 */
export function resolvePreviewLocale(cliLocale) {
  const trimmed = cliLocale != null && String(cliLocale).trim() ? String(cliLocale).trim() : "";
  if (trimmed) return normalizeLocaleTag(trimmed);
  const env = (process.env.LC_ALL || process.env.LANG || process.env.LANGUAGE || "").trim();
  if (!env || env === "C" || env === "POSIX") return "zh-CN";
  const beforeDot = env.split(".")[0] || env;
  const beforeAt = beforeDot.split("@")[0];
  return normalizeLocaleTag(beforeAt.replace(/^([a-z]{2})_([a-z]{2})$/i, "$1-$2"));
}
