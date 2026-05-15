import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPreviewLocalPageForPath,
  deepMergeTemplateVariables,
} from "../theme-preview/server/dev-preview-state.js";

test("remote path: mirrored template_variables does not emit local_page (preserve DB body)", () => {
  const state = {
    localPages: [],
    remotePagesSummary: [
      {
        id: "p1",
        path: "/announcement-holiday-support-hours",
        name: "Holiday",
        template_name: "page",
        template_variables: { foo: "bar" },
      },
    ],
    pageTextSettings: {
      "remote:p1": { foo: "bar" },
    },
    remotePathOverrides: {},
  };
  assert.equal(buildPreviewLocalPageForPath(state, "/announcement-holiday-support-hours"), null);
});

test("deepMergeTemplateVariables merges nested objects", () => {
  assert.deepEqual(
    deepMergeTemplateVariables(
      { a: 1, nested: { x: 1, y: 2 } },
      { a: 2, nested: { x: 9 } },
    ),
    { a: 2, nested: { x: 9, y: 2 } },
  );
});

test("remote path: edited template_variables emits local_page without content", () => {
  const state = {
    localPages: [],
    remotePagesSummary: [
      {
        id: "p1",
        path: "/x",
        name: "X",
        template_name: "page",
        template_variables: { a: 1 },
      },
    ],
    pageTextSettings: {
      "remote:p1": { a: 2 },
    },
    remotePathOverrides: {},
  };
  const lp = buildPreviewLocalPageForPath(state, "/x");
  assert.ok(lp);
  assert.equal(lp.template_name, "page");
  assert.deepEqual(lp.template_variables, { a: 2 });
  assert.equal("content" in lp, false);
});

test("remote path: edited template_variables deep-merges list row", () => {
  const state = {
    localPages: [],
    remotePagesSummary: [
      {
        id: "p1",
        path: "/x",
        name: "X",
        template_name: "page",
        template_variables: { a: 1, nested: { k: 1 } },
      },
    ],
    pageTextSettings: {
      "remote:p1": { a: 2 },
    },
    remotePathOverrides: {},
  };
  const lp = buildPreviewLocalPageForPath(state, "/x");
  assert.ok(lp);
  assert.deepEqual(lp.template_variables, { a: 2, nested: { k: 1 } });
});

test("remote path: template_name override only", () => {
  const state = {
    localPages: [],
    remotePagesSummary: [{ id: "p1", path: "/x", name: "X", template_name: "page" }],
    pageTextSettings: {},
    remotePathOverrides: { "/x": { template_name: "article" } },
  };
  const lp = buildPreviewLocalPageForPath(state, "/x");
  assert.ok(lp);
  assert.equal(lp.template_name, "article");
  assert.equal("template_variables" in lp, false);
  assert.equal("content" in lp, false);
});
