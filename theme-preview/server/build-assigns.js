/**
 * 从 Open API JSON:API 响应构造 Liquid 预览用 assigns（SupportedSubset，见 docs/PLAN.md）
 */

/**
 * @param {any} siteJson
 * @param {any} pagesJson
 * @param {string | undefined} currentPageId
 */
export function buildLiquidAssigns(siteJson, pagesJson, currentPageId) {
  const siteAttrs = siteJson?.data?.attributes || {};
  const site = {
    id: siteJson?.data?.id,
    name: siteAttrs.name || "Site",
    language: siteAttrs.language || "zh-CN",
    ...siteAttrs,
  };

  const pageList = (pagesJson?.data || []).map((row) => {
    const a = row.attributes || {};
    return {
      id: row.id,
      name: a.name,
      path: a.path,
      link_text: a.link_text || a.name,
      published_at: a.published_at,
      template_name: a.template_name,
      ...a,
    };
  });

  site.pages = pageList;

  let page =
    pageList.find((p) => String(p.id) === String(currentPageId)) ||
    pageList[0] || {
      id: "preview",
      name: "Preview",
      path: "/",
      link_text: "Preview",
      content: "",
    };

  if (!page.content && page.attributes?.content === undefined) {
    page = { ...page, content: `<p>（预览：该页无 content 字段，可在 API 中选用含正文的页面）</p>` };
  }

  return { site, page, pages: pageList };
}
