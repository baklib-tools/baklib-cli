/**
 * @param {import('./client.js').BaklibClient} client
 */
export function createThemeOps(client) {
  const r = client.request.bind(client);
  const rb = client.requestBuffer.bind(client);

  return {
    async listThemes(args) {
      const { from, scope } = args || {};
      const query = { all: true };
      if (from) query.from = from;
      if (scope) query.scope = scope;
      const result = await r("/themes", "GET", { query });
      return { success: true, data: result.data || [], meta: result.meta, full_response: result };
    },

    /** @param {{ theme_ref: string }} args */
    async getThemeShow(args) {
      const ref = args.theme_ref;
      const body = await r(`/themes/${encodeURIComponent(String(ref))}`, "GET");
      if (Array.isArray(body.themes) && body.themes.length > 1) {
        return { success: true, themes: body.themes };
      }
      return { success: true, theme: body.theme };
    },

    /**
     * @param {{ theme_ref: string, version_id?: string, version_name?: string, commit_oid?: string, commit_hash?: string }} args
     */
    async getThemeManifest(args) {
      const { theme_ref, version_id, version_name, commit_oid, commit_hash } = args || {};
      const query = {};
      if (version_id) query.version_id = version_id;
      if (version_name) query.version_name = version_name;
      if (commit_oid) query.commit_oid = commit_oid;
      if (commit_hash) query.commit_hash = commit_hash;
      const manifest = await r(`/themes/${encodeURIComponent(String(theme_ref))}/manifest`, "GET", { query });
      return { success: true, manifest };
    },

    /**
     * @param {{ download_path: string }} args  manifest.files[].download_path（相对 apiBase）
     */
    async downloadThemeFile(args) {
      const { download_path } = args || {};
      const path = String(download_path || "").replace(/^\//, "");
      const buf = await rb(`/${path}`, "GET");
      return buf;
    },
  };
}
