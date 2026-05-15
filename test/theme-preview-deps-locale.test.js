import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLocaleTag, resolvePreviewLocale } from "../src/lib/theme-preview-locale.js";
import { liquidRefToCandidatePaths, extractLayoutNames, extractNonLayoutRefs } from "../src/lib/theme-preview-liquid-deps.js";

test("normalizeLocaleTag", () => {
  assert.equal(normalizeLocaleTag("zh_CN.UTF-8"), "zh-CN");
  assert.equal(normalizeLocaleTag("en_US"), "en-US");
  assert.equal(normalizeLocaleTag("en"), "en");
});

test("resolvePreviewLocale uses LANG when unset", () => {
  const pLang = process.env.LANG;
  const pLc = process.env.LC_ALL;
  delete process.env.LC_ALL;
  process.env.LANG = "fr_CA.UTF-8";
  try {
    assert.equal(resolvePreviewLocale(""), "fr-CA");
  } finally {
    if (pLc === undefined) delete process.env.LC_ALL;
    else process.env.LC_ALL = pLc;
    if (pLang === undefined) delete process.env.LANG;
    else process.env.LANG = pLang;
  }
});

test("liquid refs", () => {
  assert.deepEqual(liquidRefToCandidatePaths("header"), ["snippets/_header.liquid"]);
  assert.deepEqual(extractLayoutNames('{% layout "theme" %}'), ["theme"]);
  const src = `{% render 'footer' %}\n{% section "hero" %}`;
  assert.ok(extractNonLayoutRefs(src).includes("footer"));
  assert.ok(extractNonLayoutRefs(src).includes("hero"));
});
