import { fetchPageDetail } from "./fetch-fixture.js";
import { pickJsonApiAttr } from "./jsonapi-pages.js";
import { deepMergeTemplateVariables } from "./dev-preview-state.js";

/**
 * 仅保留非 undefined 的键，减小 preview_render 请求体。
 * @param {Record<string, unknown>} o
 */
function omitUndefined(o) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * 对「已入库页面」在发送 `local_page` 前，用 Open API 单页详情补全正文、访问量、时间等，
 * 避免服务端在收到 `local_page` 时仅按局部 variables 构造页面对象导致丢失 DB 字段。
 *
 * @param {string} siteId 站点 id / hashid
 * @param {string} pageId 页面 id / hashid（与列表一致）
 * @param {Record<string, unknown>} localPage `buildPreviewLocalPageForPath` 产物
 */
export async function enrichLocalPageWithRemoteDetail(siteId, pageId, localPage) {
  const detail = await fetchPageDetail(siteId, pageId);
  const a = detail?.data?.attributes || {};

  const apiTvRaw = pickJsonApiAttr(a, "template_variables");
  const apiTv =
    apiTvRaw != null && typeof apiTvRaw === "object" && !Array.isArray(apiTvRaw)
      ? /** @type {Record<string, unknown>} */ (apiTvRaw)
      : {};

  const hasUserTv = Object.prototype.hasOwnProperty.call(localPage, "template_variables");
  const userTvRaw = localPage.template_variables;
  const userTv =
    userTvRaw != null && typeof userTvRaw === "object" && !Array.isArray(userTvRaw)
      ? /** @type {Record<string, unknown>} */ (userTvRaw)
      : {};
  const template_variables = hasUserTv ? deepMergeTemplateVariables(apiTv, userTv) : apiTv;

  const apiContent = pickJsonApiAttr(a, "content") ?? pickJsonApiAttr(a, "body") ?? "";
  const userContent = typeof localPage.content === "string" ? localPage.content : "";
  const content = userContent.length > 0 ? userContent : String(apiContent ?? "");

  const apiName = pickJsonApiAttr(a, "name");
  const name =
    typeof localPage.name === "string" && localPage.name.trim()
      ? localPage.name.trim()
      : String(apiName ?? localPage.name ?? "");

  const apiTpl = String(pickJsonApiAttr(a, "template_name") || "page").trim() || "page";
  const template_name =
    typeof localPage.template_name === "string" && localPage.template_name.trim()
      ? localPage.template_name.trim()
      : apiTpl;

  return omitUndefined({
    name,
    template_name,
    content,
    template_variables,
    published_at: pickJsonApiAttr(a, "published_at"),
    updated_at: pickJsonApiAttr(a, "updated_at"),
    created_at: pickJsonApiAttr(a, "created_at"),
    visits_count: pickJsonApiAttr(a, "visits_count"),
    visits: pickJsonApiAttr(a, "visits"),
    published: pickJsonApiAttr(a, "published"),
    slug: pickJsonApiAttr(a, "slug"),
    path: pickJsonApiAttr(a, "path") ?? pickJsonApiAttr(a, "full_path"),
    link_text: pickJsonApiAttr(a, "link_text") ?? pickJsonApiAttr(a, "calculated_link_text"),
  });
}
