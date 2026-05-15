import test from "node:test";
import assert from "node:assert/strict";
import { resolveSiteHashidForThemePreview } from "../src/api/resolve-site-hashid.js";

test("resolveSiteHashidForThemePreview uses attributes.hashid when present", async () => {
  /** @type {{ req: string[], res: unknown[] }} */
  const calls = { req: [], res: [] };
  const client = {
    async request(endpoint) {
      calls.req.push(endpoint);
      const next = calls.res.shift();
      if (typeof next !== "undefined") return next;
      throw new Error("no mock response");
    },
  };
  calls.res.push({ data: { id: "1", attributes: { hashid: "RqYk8" } } });
  const out = await resolveSiteHashidForThemePreview(client, "1");
  assert.equal(out, "RqYk8");
  assert.match(calls.req[0], /\/sites\/1$/);

  const cached = await resolveSiteHashidForThemePreview(client, "1");
  assert.equal(cached, "RqYk8");
  assert.equal(calls.req.length, 1);
});

test("resolveSiteHashidForThemePreview falls back to raw id when hashid missing", async () => {
  const client = {
    async request() {
      return { data: { id: "9", attributes: { name: "x" } } };
    },
  };
  const out = await resolveSiteHashidForThemePreview(client, "9");
  assert.equal(out, "9");
});
