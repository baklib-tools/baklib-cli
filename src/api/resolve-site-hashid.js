/**
 * 在调用 `theme_preview` 前尽量确认站点可访问，并缓存「请求用站点标识 → 解析结果」。
 * Open API 的 `data.id` 多为数字主键；`theme_preview` 已与 `GET /sites/:id` 一致支持该 id。
 * 若响应里仍有 `attributes.hashid` 且与 `data.id` 不同，则优先用 hashid（与历史客户端一致）。
 */

/** @type {Map<string, string>} */
const cache = new Map();

/**
 * @param {import("./client.js").BaklibClient} client
 * @param {string} site_id
 */
export async function resolveSiteHashidForThemePreview(client, site_id) {
  const raw = String(site_id || "").trim();
  if (!raw) return "";
  const hit = cache.get(raw);
  if (hit) return hit;

  const json = await client.request(`/sites/${encodeURIComponent(raw)}`, "GET");
  const attrs = json && typeof json.data === "object" && json.data ? json.data.attributes : null;
  const h = attrs && typeof attrs.hashid === "string" ? attrs.hashid.trim() : "";
  const out = h || raw;
  cache.set(raw, out);
  cache.set(out, out);
  return out;
}
