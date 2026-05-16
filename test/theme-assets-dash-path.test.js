import test from "node:test";
import assert from "node:assert/strict";
import {
  isThemeAssetsDashPath,
  themeAssetRelFromThemeAssetsDashPath,
} from "../theme-preview/server/theme-assets-dash-path.js";

const TOKEN =
  "eyJ0aGVtZV9zY29wZSI6ImNtcyIsInRoZW1lX25hbWUiOiJkaXJlY3RpZnkiLCJhc3NldF9vaWQiOiI1YmU3NTY4YTRjM2RmOWEwYzE5ZGQ0ZmM0NTkyZWRlNzNmZWU2MzZiIiwicGF0aCI6InN0eWxlc2hlZXRzL2FwcGxpY2F0aW9uLmNzcyJ9";
const SIG = "3a93722d6074d45ff8e522c5466736151999f563a4bc25213438274c1e88f056a";

test("themeAssetRelFromThemeAssetsDashPath decodes token path under assets/", () => {
  const urlPath = `/-/theme-assets/${TOKEN}--${SIG}/stylesheets/application.css`;
  assert.equal(themeAssetRelFromThemeAssetsDashPath(urlPath), "stylesheets/application.css");
  assert.equal(isThemeAssetsDashPath(urlPath), true);
});

test("themeAssetRelFromThemeAssetsDashPath allows token-only URL", () => {
  const urlPath = `/-/theme-assets/${TOKEN}--${SIG}`;
  assert.equal(themeAssetRelFromThemeAssetsDashPath(urlPath), "stylesheets/application.css");
});

test("themeAssetRelFromThemeAssetsDashPath rejects trail mismatch", () => {
  const urlPath = `/-/theme-assets/${TOKEN}--${SIG}/other.css`;
  assert.equal(themeAssetRelFromThemeAssetsDashPath(urlPath), null);
});

test("themeAssetRelFromThemeAssetsDashPath rejects path traversal", () => {
  const bad = Buffer.from(JSON.stringify({ path: "../secret.txt" }), "utf8").toString("base64url");
  assert.equal(themeAssetRelFromThemeAssetsDashPath(`/-/theme-assets/${bad}--${SIG}`), null);
});

test("themeAssetRelFromThemeAssetsDashPath returns null for other dash paths", () => {
  assert.equal(themeAssetRelFromThemeAssetsDashPath("/-/rails/active_storage/x"), null);
});
