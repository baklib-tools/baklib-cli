import test from "node:test";
import assert from "node:assert/strict";
import {
  rewritePreviewHtml,
  rewriteThemeHtmlForLocalAssets,
  themeAssetRelFromUrl,
} from "../theme-preview/server/html-rewrite.js";

test("themeAssetRelFromUrl maps /assets/ on https host", () => {
  assert.equal(themeAssetRelFromUrl("https://cdn.example.com/assets/foo/bar.png"), "foo/bar.png");
  assert.equal(themeAssetRelFromUrl("//cdn.example.com/assets/x.css"), "x.css");
});

test("themeAssetRelFromUrl returns null for non-assets paths", () => {
  assert.equal(themeAssetRelFromUrl("https://other.example.com/logo.png"), null);
});

test("rewriteThemeHtmlForLocalAssets rewrites /assets/ and assets/", () => {
  const html = '<link href="/assets/app.css"><script src="assets/x.js"></script><style>url(/assets/a.woff2)</style>';
  const out = rewriteThemeHtmlForLocalAssets(html);
  assert.match(out, /href="\/__theme_asset\/assets\/app\.css"/);
  assert.match(out, /src="\/__theme_asset\/assets\/x\.js"/);
  assert.match(out, /url\(\/__theme_asset\/assets\/a\.woff2\)/);
});

test("rewritePreviewHtml maps external https to __baklib_proxy", () => {
  const html = '<img src="https://dam.example.com/a.jpg" alt="">';
  const out = rewritePreviewHtml(html);
  assert.match(out, /src="\/__baklib_proxy\?url=/);
  assert.ok(out.includes(encodeURIComponent("https://dam.example.com/a.jpg")));
});

test("rewritePreviewHtml maps https /assets/ to __theme_asset", () => {
  const html = '<script src="https://cdn.test.com/assets/app.js"></script>';
  const out = rewritePreviewHtml(html);
  assert.match(out, /src="\/__theme_asset\/assets\/app\.js"/);
  assert.ok(!out.includes("__baklib_proxy"));
});

test("rewritePreviewHtml leaves already-rewritten references", () => {
  const html = '<a href="/__theme_asset/assets/x.css"><img src="/__baklib_proxy?url=x"></a>';
  assert.equal(rewritePreviewHtml(html), rewriteThemeHtmlForLocalAssets(html));
});
