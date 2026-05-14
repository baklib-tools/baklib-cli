import { mergeResponseMarkdownQuery } from "./defaults.js";
import { expandDamIdImageMarkdown, expandDamIdImageMarkdownDeep } from "./dam-markdown-resolve.js";

/**
 * @param {import('./client.js').BaklibClient} client
 */
export function createKbOps(client) {
  const r = client.request.bind(client);
  const fetchFn = r;

  return {
    async listKnowledgeBases(args) {
      const { page, per_page } = args || {};
      const query = {};
      if (page) query["page[number]"] = page;
      if (per_page) query["page[size]"] = per_page;
      const result = await r("/kb/spaces", "GET", { query });
      return { success: true, data: result.data || [], meta: result.meta, full_response: result };
    },

    async getKnowledgeBase(args) {
      const { space_id } = args || {};
      if (!space_id) throw new Error("space_id is required");
      const result = await r(`/kb/spaces/${encodeURIComponent(space_id)}`, "GET", {
        query: mergeResponseMarkdownQuery(),
      });
      return { success: true, data: result.data, full_response: result };
    },

    async listArticles(args) {
      const { space_id, keywords, page, parent_id, per_page } = args || {};
      if (!space_id) throw new Error("space_id is required");
      const query = mergeResponseMarkdownQuery();
      if (keywords) query.keywords = keywords;
      if (page) query["page[number]"] = page;
      if (per_page) query["page[size]"] = per_page;
      if (parent_id) query.parent_id = parent_id;
      const result = await r(`/kb/spaces/${encodeURIComponent(space_id)}/articles`, "GET", { query });
      return { success: true, data: result.data || [], meta: result.meta, full_response: result };
    },

    async getArticle(args) {
      const { space_id, article_id } = args || {};
      if (!space_id || !article_id) throw new Error("space_id and article_id are required");
      const result = await r(`/kb/spaces/${encodeURIComponent(space_id)}/articles/${encodeURIComponent(article_id)}`, "GET", {
        query: mergeResponseMarkdownQuery(),
      });
      return { success: true, data: result.data, full_response: result };
    },

    async createArticle(args) {
      const { space_id, title, body, position, parent_id } = args || {};
      if (!space_id || !title) throw new Error("space_id and title are required");
      const attributes = { title };
      if (body) {
        attributes.body = await expandDamIdImageMarkdown(String(body), fetchFn);
        attributes.body_format = "markdown";
      }
      if (position) attributes.position = String(position);
      if (parent_id) attributes.parent_id = String(parent_id);
      const result = await r(`/kb/spaces/${encodeURIComponent(space_id)}/articles`, "POST", {
        body: { data: { attributes } },
        query: mergeResponseMarkdownQuery(),
      });
      return { success: true, data: result.data, full_response: result };
    },

    async updateArticle(args) {
      const { space_id, article_id, title, body, position, parent_id } = args || {};
      if (!space_id || !article_id) throw new Error("space_id and article_id are required");
      const attributes = {};
      if (title !== undefined) attributes.title = title;
      if (body !== undefined) {
        attributes.body = await expandDamIdImageMarkdown(String(body), fetchFn);
        attributes.body_format = "markdown";
      }
      if (position !== undefined) attributes.position = String(position);
      if (parent_id !== undefined) attributes.parent_id = String(parent_id);
      const result = await r(
        `/kb/spaces/${encodeURIComponent(space_id)}/articles/${encodeURIComponent(article_id)}`,
        "PATCH",
        { body: { data: { attributes } }, query: mergeResponseMarkdownQuery() },
      );
      return { success: true, data: result.data, full_response: result };
    },

    async deleteArticle(args) {
      const { space_id, article_id } = args || {};
      if (!space_id || !article_id) throw new Error("space_id and article_id are required");
      await r(`/kb/spaces/${encodeURIComponent(space_id)}/articles/${encodeURIComponent(article_id)}`, "DELETE");
      return { success: true };
    },
  };
}
