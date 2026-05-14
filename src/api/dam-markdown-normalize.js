/**
 * 在调用 Baklib API 前将 DAM 图片简写规范为占位 URL。
 */

const DAM_ID_SHORT_IMG = /!\[([^\]]*)\]\(\s*dam-id\s*[:=]\s*(\d+)\s*\)/g;

/**
 * @param {string} input
 * @returns {string}
 */
export function normalizeDamIdImageMarkdown(input) {
  if (typeof input !== "string" || input.length === 0) return input;
  return input.replace(DAM_ID_SHORT_IMG, "![$1](<> \"dam-id=$2\")");
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function normalizeDamIdImageMarkdownDeep(value) {
  if (value == null) return value;
  if (typeof value === "string") return normalizeDamIdImageMarkdown(value);
  if (Array.isArray(value)) return value.map((v) => normalizeDamIdImageMarkdownDeep(v));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeDamIdImageMarkdownDeep(v);
    }
    return out;
  }
  return value;
}
