/**
 * @param {import('./client.js').BaklibClient} client
 */
export function createThemeOps(client) {
  const r = client.request.bind(client);

  return {
    async listThemes(args) {
      const { from, scope, page, per_page } = args || {};
      const query = {};
      if (from) query.from = from;
      if (scope) query.scope = scope;
      if (page) query["page[number]"] = page;
      if (per_page) query["page[size]"] = per_page;
      const result = await r("/themes", "GET", { query });
      return { success: true, data: result.data || [], meta: result.meta, full_response: result };
    },
  };
}
