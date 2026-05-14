/** 官方 Open API 主机根地址（环境变量 / 配置文件填此值即可；请求时固定追加 /api/v1） */
export const DEFAULT_API_HOST = "https://open.baklib.com";

const OPEN_API_VERSION_SUFFIX = "/api/v1";

/**
 * @param {string} raw 主机根，或已含 /api/v1 的遗留完整地址
 * @returns {string} 实际请求的 Open API 基址（以 /api/v1 结尾，无尾随斜杠）
 */
export function resolveOpenApiBaseUrl(raw) {
  let s = String(raw ?? "").trim();
  while (s.endsWith("/")) {
    s = s.slice(0, -1);
  }
  if (!s) {
    return `${DEFAULT_API_HOST}${OPEN_API_VERSION_SUFFIX}`;
  }
  if (/\/api\/v1$/i.test(s)) {
    return s;
  }
  return `${s}${OPEN_API_VERSION_SUFFIX}`;
}

/**
 * 从已解析的基址反推用户概念上的主机根（用于展示或写入配置文件）
 * @param {string} resolvedBase
 */
export function openApiHostFromResolvedBase(resolvedBase) {
  let s = String(resolvedBase ?? "").trim();
  while (s.endsWith("/")) {
    s = s.slice(0, -1);
  }
  if (!s) {
    return DEFAULT_API_HOST;
  }
  if (/\/api\/v1$/i.test(s)) {
    const host = s.replace(/\/api\/v1$/i, "").replace(/\/+$/, "");
    return host || DEFAULT_API_HOST;
  }
  return s;
}
