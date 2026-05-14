import { buildLiquidAssigns } from "./build-assigns.js";
import { resolveOpenApiBaseUrl } from "./open-api-defaults.js";

function authHeaders() {
  const token = process.env.BAKLIB_TOKEN || process.env.BAKLIB_MCP_TOKEN;
  if (!token) throw new Error("缺少 BAKLIB_TOKEN（或环境变量中提供 Token）");
  return { Authorization: token };
}

export function apiBase() {
  const raw = process.env.BAKLIB_API_BASE || process.env.BAKLIB_MCP_API_BASE || "";
  return resolveOpenApiBaseUrl(raw);
}

/**
 * @param {string} siteId
 */
export async function fetchSiteFixture(siteId) {
  const base = apiBase();
  const h = authHeaders();
  const q = new URLSearchParams({ body_format: "markdown", "page[size]": "50" });
  const [siteRes, pagesRes] = await Promise.all([
    fetch(`${base}/sites/${encodeURIComponent(siteId)}`, { headers: h }),
    fetch(`${base}/sites/${encodeURIComponent(siteId)}/pages?${q}`, { headers: h }),
  ]);
  if (!siteRes.ok) throw new Error(`site: ${siteRes.status} ${await siteRes.text()}`);
  if (!pagesRes.ok) throw new Error(`pages: ${pagesRes.status} ${await pagesRes.text()}`);
  const siteJson = await siteRes.json();
  const pagesJson = await pagesRes.json();
  return { siteJson, pagesJson };
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

/**
 * @param {string} siteId
 * @param {string | undefined} pageId
 */
export async function buildPreviewAssigns(siteId, pageId) {
  const { siteJson, pagesJson } = await fetchSiteFixture(siteId);
  const assigns = buildLiquidAssigns(siteJson, pagesJson, pageId);
  if (pageId) {
    try {
      const detail = await fetchPageDetail(siteId, pageId);
      const a = detail?.data?.attributes || {};
      assigns.page = {
        id: detail?.data?.id,
        name: a.name,
        path: a.path,
        link_text: a.link_text || a.name,
        content: a.content ?? a.body ?? "",
        template_variables: a.template_variables,
        ...a,
      };
    } catch {
      /* 使用列表中的简略 page */
    }
  }
  return assigns;
}
