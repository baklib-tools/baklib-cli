/**
 * @param {import('./client.js').BaklibClient} client
 */
export function createUserOps(client) {
  const r = client.request.bind(client);

  return {
    async listUsers(args) {
      const { page, per_page } = args || {};
      const query = {};
      if (page) query["page[number]"] = page;
      if (per_page) query["page[size]"] = per_page;
      const result = await r("/users", "GET", { query });
      return { success: true, data: result.data || [], meta: result.meta, full_response: result };
    },

    async getCurrent() {
      const result = await r("/user", "GET");
      return { success: true, data: result.data, full_response: result };
    },
  };
}
