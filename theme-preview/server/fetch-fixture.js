import { resolveOpenApiBaseUrl } from "./open-api-defaults.js";

function authHeaders() {
  const token = process.env.BAKLIB_TOKEN || process.env.BAKLIB_MCP_TOKEN;
  if (!token) throw new Error("缺少 BAKLIB_TOKEN（或环境变量中提供 Token）");
  return { Authorization: token };
}

function apiBase() {
  const raw = process.env.BAKLIB_API_BASE || process.env.BAKLIB_MCP_API_BASE || "";
  return resolveOpenApiBaseUrl(raw);
}

/**
 * @param {string} siteId
 * @param {string} pageId
 */
export async function fetchPageDetail(siteId, pageId) {
  const base = apiBase();
  const h = authHeaders();
  const q = new URLSearchParams({ body_format: "markdown" });
  const res = await fetch(
    `${base}/sites/${encodeURIComponent(siteId)}/pages/${encodeURIComponent(pageId)}?${q}`,
    { headers: h },
  );
  if (!res.ok) throw new Error(`page: ${res.status} ${await res.text()}`);
  return res.json();
}
