import fs from "fs/promises";
import path from "path";
import FormData from "form-data";
import { mergeResponseMarkdownQuery } from "./defaults.js";
import { postMultipart } from "./post-multipart.js";

/**
 * @param {import('./client.js').BaklibClient} client
 */
export function createDamOps(client) {
  const r = client.request.bind(client);

  return {
    async uploadEntity(args) {
      const { file_path, name: fileName } = args || {};
      if (!file_path) throw new Error("file_path is required");
      const absolutePath = path.isAbsolute(file_path) ? file_path : path.resolve(process.cwd(), file_path);
      await fs.access(absolutePath);
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) throw new Error(`Path is not a file: ${absolutePath}`);
      const finalFileName = fileName || path.basename(absolutePath);
      const fileBuffer = await fs.readFile(absolutePath);
      const ext = path.extname(finalFileName).toLowerCase();
      const mimeTypes = {
        ".md": "text/markdown",
        ".txt": "text/plain",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
        ".mp4": "video/mp4",
        ".mp3": "audio/mpeg",
      };
      const mimeType = mimeTypes[ext] || "application/octet-stream";
      const formData = new FormData();
      formData.append("data[type]", "dam_files");
      formData.append("data[attributes][file]", fileBuffer, {
        filename: finalFileName,
        contentType: mimeType,
      });
      const apiUrl = `${client.apiBase}/dam/files`;
      const result = await postMultipart(apiUrl, client.token, formData);
      const attrs = result.data?.attributes;
      return {
        success: true,
        id: result.data?.id,
        iid: attrs?.iid,
        name: finalFileName,
        url: attrs?.url,
        full_response: result,
      };
    },

    async listEntities(args) {
      const { name, page, per_page, type, deleted } = args || {};
      const query = {};
      if (name) query.name = name;
      if (page) query["page[number]"] = page;
      if (per_page) query["page[size]"] = per_page;
      if (type) query.type = type;
      if (deleted !== undefined) query.deleted = deleted;
      const result = await r("/dam/entities", "GET", { query });
      return { success: true, data: result.data || [], meta: result.meta, full_response: result };
    },

    async getEntity(args) {
      const { id, include_signed_id, purpose } = args || {};
      if (!id) throw new Error("id is required");
      const query = mergeResponseMarkdownQuery();
      if (include_signed_id) query.include_signed_id = true;
      if (purpose) query.purpose = purpose;
      const result = await r(`/dam/entities/${encodeURIComponent(id)}`, "GET", { query });
      return { success: true, data: result.data, full_response: result };
    },

    async deleteEntity(args) {
      const { id } = args || {};
      if (!id) throw new Error("id is required");
      await r(`/dam/entities/${encodeURIComponent(id)}`, "DELETE");
      return { success: true };
    },

    async updateEntity(args) {
      const { id, name, description } = args || {};
      if (!id) throw new Error("id is required");
      const attributes = {};
      if (name !== undefined) attributes.name = name;
      if (description !== undefined) attributes.description = description;
      const result = await r(`/dam/files/${encodeURIComponent(id)}`, "PATCH", {
        body: { data: { attributes } },
      });
      return { success: true, data: result.data, full_response: result };
    },

    async createEntityUrl(args) {
      const { entity_id, purpose, expires_in } = args || {};
      if (!entity_id) throw new Error("entity_id is required");
      const body = { data: { attributes: {} } };
      if (purpose) body.data.attributes.purpose = purpose;
      if (expires_in != null) body.data.attributes.expires_in = expires_in;
      const result = await r(`/dam/entities/${encodeURIComponent(entity_id)}/urls`, "POST", { body });
      return { success: true, data: result.data, full_response: result };
    },

    async createFragment(args) {
      const { name, body: fragBody, description, body_format = "markdown" } = args || {};
      if (!name || !fragBody) throw new Error("name and body are required");
      const result = await r("/dam/fragments", "POST", {
        body: {
          data: {
            attributes: { name, body: fragBody, body_format, ...(description ? { description } : {}) },
          },
        },
        query: mergeResponseMarkdownQuery(),
      });
      return { success: true, data: result.data, full_response: result };
    },

    async updateFragment(args) {
      const { entity_id, name, body: fragBody, description, body_format = "markdown", collection_ids, tag_ids } =
        args || {};
      if (!entity_id) throw new Error("entity_id is required");
      const attributes = {};
      if (name !== undefined) attributes.name = name;
      if (fragBody !== undefined) {
        attributes.body = fragBody;
        attributes.body_format = body_format;
      }
      if (description !== undefined) attributes.description = description;
      if (collection_ids) attributes.collection_ids = collection_ids;
      if (tag_ids) attributes.tag_ids = tag_ids;
      const result = await r(`/dam/fragments/${encodeURIComponent(entity_id)}`, "PATCH", {
        body: { data: { attributes } },
        query: mergeResponseMarkdownQuery(),
      });
      return { success: true, data: result.data, full_response: result };
    },

    async createLink(args) {
      const { url, name, description, title, link_description, collection_ids, tag_ids, include_signed_id, purpose } =
        args || {};
      if (!url) throw new Error("url is required");
      const attributes = { url };
      if (name !== undefined) attributes.name = name;
      if (description !== undefined) attributes.description = description;
      if (title !== undefined) attributes.title = title;
      if (link_description !== undefined) attributes.link_description = link_description;
      if (collection_ids) attributes.collection_ids = collection_ids;
      if (tag_ids) attributes.tag_ids = tag_ids;
      const query = mergeResponseMarkdownQuery();
      if (include_signed_id) query.include_signed_id = true;
      if (purpose) query.purpose = purpose;
      const result = await r("/dam/links", "POST", {
        body: { data: { attributes } },
        query,
      });
      return { success: true, data: result.data, full_response: result };
    },

    async updateLink(args) {
      const { entity_id, name, description, url, title, link_description, collection_ids, tag_ids } = args || {};
      if (!entity_id) throw new Error("entity_id is required");
      const attributes = {};
      if (name !== undefined) attributes.name = name;
      if (description !== undefined) attributes.description = description;
      if (url !== undefined) attributes.url = url;
      if (title !== undefined) attributes.title = title;
      if (link_description !== undefined) attributes.link_description = link_description;
      if (collection_ids) attributes.collection_ids = collection_ids;
      if (tag_ids) attributes.tag_ids = tag_ids;
      const result = await r(`/dam/links/${encodeURIComponent(entity_id)}`, "PATCH", {
        body: { data: { attributes } },
        query: mergeResponseMarkdownQuery(),
      });
      return { success: true, data: result.data, full_response: result };
    },

    async listCollections(args) {
      const { name_eq, name_cont, page, parent_id_eq, per_page } = args || {};
      const query = {};
      if (name_eq) query["q[name_eq]"] = name_eq;
      if (name_cont) query["q[name_cont]"] = name_cont;
      if (parent_id_eq != null) query["q[parent_id_eq]"] = parent_id_eq;
      if (page) query["page[number]"] = page;
      if (per_page) query["page[size]"] = per_page;
      const result = await r("/dam/collections", "GET", { query });
      return { success: true, data: result.data || [], meta: result.meta, full_response: result };
    },

    async getCollectionLimits() {
      const result = await r("/dam/collections/limits", "GET");
      return { success: true, data: result.data, full_response: result };
    },
  };
}
