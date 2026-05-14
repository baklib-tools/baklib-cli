import { BaklibClient } from "./client.js";
import { createDamOps } from "./ops-dam.js";
import { createKbOps } from "./ops-kb.js";
import { createSiteOps } from "./ops-site.js";
import { createThemeOps } from "./ops-theme.js";
import { createMemberOps } from "./ops-member.js";
import { createUserOps } from "./ops-user.js";

/**
 * @param {{ token: string, apiBase: string }} config
 */
export function createBaklibApi(config) {
  const client = new BaklibClient(config);
  return {
    client,
    dam: createDamOps(client),
    kb: createKbOps(client),
    site: createSiteOps(client),
    theme: createThemeOps(client),
    member: createMemberOps(client),
    user: createUserOps(client),
  };
}

export { BaklibClient } from "./client.js";
