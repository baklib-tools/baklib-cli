import test from "node:test";
import assert from "node:assert/strict";
import { isPreviewRenderDashScopePath, normalizeDashPathForMatch } from "../theme-preview/server/preview-dash-routes.js";

test("normalizeDashPathForMatch strips query and trailing slash", () => {
  assert.equal(normalizeDashPathForMatch("/-/search?a=1"), "/-/search");
  assert.equal(normalizeDashPathForMatch("/-/search/"), "/-/search");
});

test("isPreviewRenderDashScopePath: Liquid 预览白名单", () => {
  assert.equal(isPreviewRenderDashScopePath("/-/search"), true);
  assert.equal(isPreviewRenderDashScopePath("/-/nav_tree"), true);
  assert.equal(isPreviewRenderDashScopePath("/-/tags/foo"), true);
  assert.equal(isPreviewRenderDashScopePath("/-/feedback/new"), true);
});

test("isPreviewRenderDashScopePath: 其余 /-/ 走门户回源", () => {
  assert.equal(isPreviewRenderDashScopePath("/-/rails/active_storage/disk/abc/blob/x.webp"), false);
  assert.equal(isPreviewRenderDashScopePath("/-/theme-assets/tok/app.css"), false);
  assert.equal(isPreviewRenderDashScopePath("/-/dam/files"), false);
});
