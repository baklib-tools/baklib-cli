import { resolveSiteHashidForThemePreview } from "./resolve-site-hashid.js";

/**
 * @param {Record<string, unknown>} body
 */
export function themePreviewSessionIdFromResponse(body) {
  const sid = body.session_id ?? body.sessionId;
  return typeof sid === "string" && sid.length > 0 ? sid : null;
}

/**
 * @param {import('./client.js').BaklibClient} client
 */
export function createThemePreviewOps(client) {
  const r = client.request.bind(client);

  return {
    /** @returns {Promise<Record<string, unknown>>} */
    createSession() {
      return r("/theme_preview/sessions", "POST");
    },

    /** @param {{ sessionId: string }} args */
    deleteSession(args) {
      const id = encodeURIComponent(String(args.sessionId));
      return r(`/theme_preview/sessions/${id}`, "DELETE");
    },

    /**
     * @param {{ sessionId: string, files: Record<string, string> }} args
     * @returns {Promise<{ synced: number }>}
     */
    sync(args) {
      const id = encodeURIComponent(String(args.sessionId));
      return r(`/theme_preview/sessions/${id}/sync`, "POST", { body: { files: args.files } });
    },

    /**
     * @param {{ sessionId: string, site_id: string, path: string, local_page?: Record<string, unknown>, body_format?: string }} args
     * @returns {Promise<{ html: string, _httpStatus?: number }>}
     */
    previewRender(args) {
      const id = encodeURIComponent(String(args.sessionId));
      return (async () => {
        const siteId = await resolveSiteHashidForThemePreview(client, args.site_id);
        const body = {
          site_id: siteId,
          path: args.path,
        };
        if (args.local_page && typeof args.local_page === "object") {
          body.local_page = args.local_page;
        }
        if (args.body_format != null && String(args.body_format).trim() !== "") {
          body.body_format = String(args.body_format).trim();
        } else if (args.local_page && typeof args.local_page === "object") {
          body.body_format = "markdown";
        }
        return r(`/theme_preview/sessions/${id}/preview_render`, "POST", {
          body,
          acceptStatuses: [200, 404],
        });
      })();
    },
  };
}
