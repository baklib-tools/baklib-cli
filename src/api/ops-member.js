/**
 * @param {import('./client.js').BaklibClient} client
 */
export function createMemberOps(client) {
  const r = client.request.bind(client);

  return {
    async listMembers(args) {
      const { page, per_page } = args || {};
      const query = {};
      if (page) query["page[number]"] = page;
      if (per_page) query["page[size]"] = per_page;
      const result = await r("/members", "GET", { query });
      return { success: true, data: result.data || [], meta: result.meta, full_response: result };
    },

    async getMember(args) {
      const { member_id } = args || {};
      if (!member_id) throw new Error("member_id is required");
      const result = await r(`/members/${encodeURIComponent(member_id)}`, "GET");
      return { success: true, data: result.data, full_response: result };
    },
  };
}
