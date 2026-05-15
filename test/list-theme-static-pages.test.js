import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listThemeStaticPreviewRoutes } from "../theme-preview/server/list-theme-static-pages.js";

test("listThemeStaticPreviewRoutes: empty when no statics/", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "baklib-theme-"));
  const routes = await listThemeStaticPreviewRoutes(dir);
  assert.deepEqual(routes, []);
});

test("listThemeStaticPreviewRoutes: maps nested .liquid to /s/…", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "baklib-theme-"));
  await fs.mkdir(path.join(dir, "statics", "page"), { recursive: true });
  await fs.writeFile(path.join(dir, "statics", "about-us.liquid"), "x", "utf8");
  await fs.writeFile(path.join(dir, "statics", "page", "nav_tree.liquid"), "y", "utf8");
  await fs.writeFile(path.join(dir, "statics", "skip.txt"), "z", "utf8");
  const routes = await listThemeStaticPreviewRoutes(dir);
  assert.equal(routes.length, 2);
  assert.deepEqual(
    routes.map((r) => r.path),
    ["/s/about-us", "/s/page/nav_tree"],
  );
  assert.ok(routes.every((r) => r.rel.startsWith("statics/") && r.slug));
});
