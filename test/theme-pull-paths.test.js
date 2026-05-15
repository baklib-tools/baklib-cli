import test from "node:test";
import assert from "node:assert/strict";
import { resolveThemePullRoots } from "../src/lib/theme-pull-paths.js";

const cwd = "/project/workspace";

test("no dir/out → cwd for both roots", () => {
  const r = resolveThemePullRoots({}, cwd);
  assert.equal(r.outRoot, cwd);
  assert.equal(r.gitRoot, cwd);
});

test("--dir only → out and git both that directory", () => {
  const r = resolveThemePullRoots({ dir: "./blog" }, cwd);
  assert.equal(r.outRoot, "/project/workspace/blog");
  assert.equal(r.gitRoot, "/project/workspace/blog");
});

test("--out only → git follows output directory", () => {
  const r = resolveThemePullRoots({ out: "./export" }, cwd);
  assert.equal(r.outRoot, "/project/workspace/export");
  assert.equal(r.gitRoot, "/project/workspace/export");
});

test("--dir + --out → git in dir, files to out", () => {
  const r = resolveThemePullRoots({ dir: "./blog", out: "/tmp/out" }, cwd);
  assert.equal(r.gitRoot, "/project/workspace/blog");
  assert.equal(r.outRoot, "/tmp/out");
});
