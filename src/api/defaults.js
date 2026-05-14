/** 与 Baklib `Api::BodyFormatParam` 对齐：响应与部分写入使用 markdown */

export const RESPONSE_MARKDOWN_QUERY = { body_format: "markdown" };

export function mergeResponseMarkdownQuery(query = {}) {
  return { ...query, ...RESPONSE_MARKDOWN_QUERY };
}
