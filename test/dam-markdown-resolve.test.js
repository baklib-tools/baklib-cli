import test from "node:test";
import assert from "node:assert/strict";
import {
  expandDamIdImageMarkdown,
  expandDamIdImageMarkdownDeep,
  wrapMarkdownImageDestination,
} from "../src/api/dam-markdown-resolve.js";

test("wrapMarkdownImageDestination uses angle brackets when URL has spaces or parens", () => {
  assert.equal(wrapMarkdownImageDestination("https://x/a.png"), "https://x/a.png");
  assert.equal(wrapMarkdownImageDestination("https://x/a (1).png"), "<https://x/a (1).png>");
  assert.equal(wrapMarkdownImageDestination("https://x/a b.png"), "<https://x/a b.png>");
});

test("expandDamIdImageMarkdown rewrites shorthand with entity url and dam-id in title", async () => {
  const calls = [];
  const fetchFn = async (endpoint) => {
    calls.push(endpoint);
    assert.match(endpoint, /^\/dam\/entities\/7\b/);
    return {
      data: {
        id: "99",
        attributes: { url: "https://cdn.example.com/z.png", iid: 7 },
      },
    };
  };
  const out = await expandDamIdImageMarkdown("x ![a](dam-id=7) y", fetchFn);
  assert.equal(out, "x ![a](https://cdn.example.com/z.png \"dam-id=7\") y");
  assert.equal(calls.length, 1);
});

test("expandDamIdImageMarkdown fixes broken img src=dam-id=", async () => {
  const fetchFn = async () => ({
    data: { id: "1", attributes: { url: "https://u/1.png", iid: 3 } },
  });
  const out = await expandDamIdImageMarkdown('<img src="dam-id=3" alt="hi">', fetchFn);
  assert.match(out, /!\[hi\]\(https:\/\/u\/1\.png "dam-id=3"\)/);
});

test("expandDamIdImageMarkdown falls back to <> placeholder when GET fails", async () => {
  const fetchFn = async () => {
    throw new Error("404");
  };
  const out = await expandDamIdImageMarkdown("![x](dam-id=999)", fetchFn);
  assert.equal(out, "![x](<> \"dam-id=999\")");
});

test("expandDamIdImageMarkdownDeep expands nested strings", async () => {
  const fetchFn = async () => ({
    data: { attributes: { url: "https://u/z.png", iid: 2 } },
  });
  const out = await expandDamIdImageMarkdownDeep({ a: { b: "![](dam-id=2)" } }, fetchFn);
  assert.deepEqual(out, { a: { b: "![](https://u/z.png \"dam-id=2\")" } });
});
