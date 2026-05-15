import test from "node:test";
import assert from "node:assert/strict";
import { resolvePortalAssetUrl } from "../theme-preview/server/portal-asset-url.js";

test("resolvePortalAssetUrl: rel against portal root", () => {
  const u = resolvePortalAssetUrl("https://wiki.example.com", { rel: "assets/editor-abc.css" });
  assert.equal(u, "https://wiki.example.com/assets/editor-abc.css");
});

test("resolvePortalAssetUrl: rel against portal with subpath", () => {
  const u = resolvePortalAssetUrl("https://wiki.example.com/docs", { rel: "assets/x.js" });
  assert.equal(u, "https://wiki.example.com/docs/assets/x.js");
});

test("resolvePortalAssetUrl: absolute pathname from host root", () => {
  const u = resolvePortalAssetUrl("https://wiki.example.com/docs", {
    pathname: "/-/theme-assets/token",
    search: "?v=1",
  });
  assert.equal(u, "https://wiki.example.com/-/theme-assets/token?v=1");
});

test("resolvePortalAssetUrl rejects traversal in rel", () => {
  assert.equal(resolvePortalAssetUrl("https://a.com/", { rel: "../etc/passwd" }), null);
});

test("resolvePortalAssetUrl rejects traversal in pathname", () => {
  assert.equal(resolvePortalAssetUrl("https://a.com/", { pathname: "/foo/../bar" }), null);
});
