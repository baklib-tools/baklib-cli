import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createLiquidEngine } from "../theme-preview/server/baklib-liquid-registry.js";

test("liquid registry: meta_tags, asset_url chain, render snippet", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "baklib-theme-"));
  await fs.mkdir(path.join(dir, "snippets"), { recursive: true });
  await fs.writeFile(path.join(dir, "snippets", "_nav.liquid"), "<nav>ok</nav>", "utf8");
  const engine = createLiquidEngine({ themeRoot: dir });
  const html = await engine.parseAndRender(
    `{% meta_tags %}{{ 'a.css' | asset_url | stylesheet_tag }}{% render 'nav' %}`,
    { site: { name: "S" }, page: { name: "P" } },
  );
  assert.match(html, /charset/);
  assert.match(html, /__theme_asset/);
  assert.match(html, /<nav>ok<\/nav>/);
});
