import test from "node:test";
import assert from "node:assert/strict";
import { formatHumanResult } from "../src/lib/cli-output.js";

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
