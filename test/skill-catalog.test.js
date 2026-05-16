import test from "node:test";
import assert from "node:assert/strict";
import { THEME_DEV_SKILL_ID, THEME_DEV_SKILL_NPX_SOURCE } from "../src/lib/skill-catalog.js";

test("THEME_DEV_SKILL_ID is baklib-theme-dev", () => {
  assert.equal(THEME_DEV_SKILL_ID, "baklib-theme-dev");
});

test("THEME_DEV_SKILL_NPX_SOURCE is baklib-tools/skills", () => {
  assert.equal(THEME_DEV_SKILL_NPX_SOURCE, "baklib-tools/skills");
});
