import { mergeResponseMarkdownQuery } from "./defaults.js";
import { expandDamIdImageMarkdownDeep } from "./dam-markdown-resolve.js";

/**
 * @param {import('./client.js').BaklibClient} client
 */
export function createSiteOps(client) {
  const r = client.request.bind(client);
  const fetchFn = r;

  return {
    async listSites(args) {
      const { page, per_page } = args || {};
      const query = {};
      if (page) query["page[number]"] = page;
      if (per_page) query["page[size]"] = per_page;
      const result = await r("/sites", "GET", { query });
      return { success: true, data: result.data || [], meta: result.meta, full_response: result };
    },

    async getSite(args) {
      const { site_id } = args || {};
      if (!site_id) throw new Error("site_id is required");
      const result = await r(`/sites/${encodeURIComponent(site_id)}`, "GET");
      return { success: true, data: result.data, full_response: result };
    },

    async listPages(args) {
      const { site_id, keywords, page, parent_id, per_page, published, tags, deleted, include_details } =
        args || {};
      if (!site_id) throw new Error("site_id is required");
      const query = mergeResponseMarkdownQuery();
      if (keywords) query.keywords = keywords;
      if (page) query["page[number]"] = page;
      if (per_page) query["page[size]"] = per_page;
      if (parent_id) query.parent_id = parent_id;
      if (published !== undefined) query.published = published;
      if (tags) query.tags = tags;
      if (deleted !== undefined) query.deleted = deleted;
      if (include_details) query.include_details = include_details;
      const result = await r(`/sites/${encodeURIComponent(site_id)}/pages`, "GET", { query });
      return { success: true, data: result.data || [], meta: result.meta, full_response: result };
    },

    async getPage(args) {
      const { site_id, page_id, full_path } = args || {};
      if (!site_id || !page_id) throw new Error("site_id and page_id are required");
      const query = mergeResponseMarkdownQuery();
      if (full_path) query.full_path = full_path;
      const result = await r(`/sites/${encodeURIComponent(site_id)}/pages/${encodeURIComponent(page_id)}`, "GET", {
        query,
      });
      return { success: true, data: result.data, full_response: result };
    },

    async createPage(args) {
      const { site_id, name, template_name, parent_id, template_variables, published, position } = args || {};
      if (!site_id || !name || !template_name) throw new Error("site_id, name, and template_name are required");
      const attributes = { name, template_name };
      if (parent_id) attributes.parent_id = parent_id;
      if (template_variables) {
        attributes.template_variables = await expandDamIdImageMarkdownDeep(structuredClone(template_variables), fetchFn);
      }
      if (published !== undefined) attributes.published = published;
      if (position !== undefined) attributes.position = position;
      const result = await r(`/sites/${encodeURIComponent(site_id)}/pages`, "POST", {
        body: { data: { attributes } },
        query: mergeResponseMarkdownQuery(),
      });
      return { success: true, data: result.data, full_response: result };
    },

    async updatePage(args) {
      const { site_id, page_id, name, template_variables, published, position, full_path } = args || {};
      if (!site_id || !page_id) throw new Error("site_id and page_id are required");
      const attributes = {};
      if (name) attributes.name = name;
      if (template_variables) {
        attributes.template_variables = await expandDamIdImageMarkdownDeep(structuredClone(template_variables), fetchFn);
      }
      if (published !== undefined) attributes.published = published;
      if (position !== undefined) attributes.position = position;
      const query = mergeResponseMarkdownQuery();
      if (full_path) query.full_path = full_path;
      const result = await r(`/sites/${encodeURIComponent(site_id)}/pages/${encodeURIComponent(page_id)}`, "PATCH", {
        body: { data: { attributes } },
        query,
      });
      return { success: true, data: result.data, full_response: result };
    },

    async deletePage(args) {
      const { site_id, page_id, full_path } = args || {};
      if (!site_id || !page_id) throw new Error("site_id and page_id are required");
      const query = {};
      if (full_path) query.full_path = full_path;
      await r(`/sites/${encodeURIComponent(site_id)}/pages/${encodeURIComponent(page_id)}`, "DELETE", { query });
      return { success: true };
    },

    async listTags(args) {
      const { site_id, page, per_page } = args || {};
      if (!site_id) throw new Error("site_id is required");
      const query = {};
      if (page) query["page[number]"] = page;
      if (per_page) query["page[size]"] = per_page;
      const result = await r(`/sites/${encodeURIComponent(site_id)}/tags`, "GET", { query });
      return { success: true, data: result.data || [], meta: result.meta, full_response: result };
    },

    async getTag(args) {
      const { site_id, tag_id, name } = args || {};
      if (!site_id || !tag_id) throw new Error("site_id and tag_id are required");
      const query = {};
      if (name) query.name = name;
      const result = await r(`/sites/${encodeURIComponent(site_id)}/tags/${encodeURIComponent(tag_id)}`, "GET", {
        query,
      });
      return { success: true, data: result.data, full_response: result };
    },

    async createTag(args) {
      const { site_id, name, bg_color } = args || {};
      if (!site_id || !name) throw new Error("site_id and name are required");
      const attributes = { name };
      if (bg_color) attributes.bg_color = bg_color;
      const result = await r(`/sites/${encodeURIComponent(site_id)}/tags`, "POST", {
        body: { data: { attributes } },
      });
      return { success: true, data: result.data, full_response: result };
    },

    async updateTag(args) {
      const { site_id, tag_id, name, bg_color } = args || {};
      if (!site_id || !tag_id) throw new Error("site_id and tag_id are required");
      const attributes = {};
      if (name !== undefined) attributes.name = name;
      if (bg_color !== undefined) attributes.bg_color = bg_color;
      const result = await r(`/sites/${encodeURIComponent(site_id)}/tags/${encodeURIComponent(tag_id)}`, "PATCH", {
        body: { data: { attributes } },
      });
      return { success: true, data: result.data, full_response: result };
    },

    async deleteTag(args) {
      const { site_id, tag_id } = args || {};
      if (!site_id || !tag_id) throw new Error("site_id and tag_id are required");
      await r(`/sites/${encodeURIComponent(site_id)}/tags/${encodeURIComponent(tag_id)}`, "DELETE");
      return { success: true };
    },
  };
}
