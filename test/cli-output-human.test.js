import test from "node:test";
import assert from "node:assert/strict";
import { formatHumanResult, formatThemeSummaryHumanLine } from "../src/lib/cli-output.js";

test("human output omits full_response for API list", () => {
  const s = formatHumanResult({
    success: true,
    data: [
      {
        id: "1",
        type: "kb--space",
        attributes: { name: "The CookBook", articles_count: 1650, updated_at: "2026-05-01T23:42:53.203+08:00" },
      },
    ],
    meta: { total_count: 1, current_page: 1, page_size: 10 },
    full_response: { shouldNotAppear: true },
  });
  assert.match(s, /The CookBook/);
  assert.match(s, /共 1 条/);
  assert.doesNotMatch(s, /full_response/);
  assert.doesNotMatch(s, /shouldNotAppear/);
});

test("human output for upload-style payload", () => {
  const s = formatHumanResult({
    success: true,
    id: "99",
    iid: "abc",
    name: "logo.png",
    url: "https://example.com/f",
    full_response: { nested: 1 },
  });
  assert.match(s, /id: 99/);
  assert.doesNotMatch(s, /nested/);
});

test("human theme list pads id and omits theme type", () => {
  const s = formatHumanResult({
    success: true,
    data: [
      {
        id: 3,
        type: "theme",
        attributes: { name: "guide", scope: "cms", updated_at: "2026-03-09T11:26:27.000+08:00" },
      },
      {
        id: 110,
        type: "theme",
        attributes: { name: "tailpro", scope: "cms", updated_at: "2026-02-27T16:35:02.000+08:00" },
      },
    ],
    meta: {},
  });
  assert.doesNotMatch(s, /\btheme\b/);
  assert.match(s, /\[  3\]/);
  assert.match(s, /\[110\]/);
  assert.match(s, /cms  ·  guide/);
  assert.match(s, /cms  ·  tailpro/);
});

test("formatThemeSummaryHumanLine matches list row style", () => {
  const line = formatThemeSummaryHumanLine({
    id: 3,
    name: "guide",
    scope: "cms",
    updated_at: "2026-03-09T11:26:27.000+08:00",
  });
  assert.equal(line, "  [  3]  cms  ·  guide  ·  更新 2026-03-09 11:26:27");
});

test("human meta omits pagination line when all items fit one page", () => {
  const s = formatHumanResult({
    success: true,
    data: [{ id: "1", type: "theme", attributes: { name: "a", scope: "cms" } }],
    meta: { total_count: 20, current_page: 1, page_size: 20, next_page: null },
  });
  assert.match(s, /共 20 条/);
  assert.doesNotMatch(s, /第 1 页/);
});
