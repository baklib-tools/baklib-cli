import test from "node:test";
import assert from "node:assert/strict";
import { jsonApiDataArray, jsonApiRowsToRemotePageRows, pickJsonApiAttr } from "../theme-preview/server/jsonapi-pages.js";

test("pickJsonApiAttr prefers snake then dash", () => {
  assert.equal(pickJsonApiAttr({ "full-path": "/x" }, "full_path"), "/x");
  assert.equal(pickJsonApiAttr({ full_path: "/y" }, "full_path"), "/y");
});

test("jsonApiDataArray handles array and single resource", () => {
  assert.deepEqual(jsonApiDataArray({ data: [{ id: "1" }] }), [{ id: "1" }]);
  assert.deepEqual(jsonApiDataArray({ data: { id: "2" } }), [{ id: "2" }]);
});

test("jsonApiRowsToRemotePageRows reads dashed full-path", () => {
  const rows = [
    {
      id: "p1",
      type: "page",
      attributes: { name: "Home", "full-path": "/", "template-name": "index" },
    },
    {
      id: "p2",
      type: "page",
      attributes: { name: "About", "full-path": "/about", "parent-id": "p1" },
      relationships: { parent: { data: { type: "page", id: "p1" } } },
    },
  ];
  const out = jsonApiRowsToRemotePageRows(rows);
  assert.equal(out[0].path, "/");
  assert.equal(out[1].path, "/about");
  assert.equal(out[1].parent_id, "p1");
});

test("jsonApiRowsToRemotePageRows maps index+slug home to root path", () => {
  const rows = [
    {
      id: "p1",
      type: "page",
      attributes: { name: "Home", slug: "home", "template-name": "index" },
    },
  ];
  const out = jsonApiRowsToRemotePageRows(rows);
  assert.equal(out[0].path, "/");
});

test("jsonApiRowsToRemotePageRows maps template_variables when present", () => {
  const rows = [
    {
      id: "1",
      type: "page",
      attributes: {
        hashid: "Pg_x1",
        name: "About",
        full_path: "/about",
        template_name: "page",
        template_variables: { hero_title: "Hi", blocks: [{ type: "text" }] },
      },
    },
  ];
  const out = jsonApiRowsToRemotePageRows(rows);
  assert.equal(out[0].id, "Pg_x1");
  assert.deepEqual(out[0].template_variables, { hero_title: "Hi", blocks: [{ type: "text" }] });
});

test("jsonApiRowsToRemotePageRows prefers attributes.hashid for id and parent_id", () => {
  const rows = [
    {
      id: "1",
      type: "page",
      attributes: { hashid: "Pg_x1", name: "Home", full_path: "/", template_name: "index" },
    },
    {
      id: "2",
      type: "page",
      attributes: { hashid: "Pg_y2", name: "About", full_path: "/about", parent_id: 1 },
    },
  ];
  const out = jsonApiRowsToRemotePageRows(rows);
  assert.equal(out[0].id, "Pg_x1");
  assert.equal(out[1].id, "Pg_y2");
  assert.equal(out[1].parent_id, "Pg_x1");
});
