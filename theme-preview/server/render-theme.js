import fs from "fs/promises";
import path from "path";
import { createLiquidEngine } from "./baklib-liquid-registry.js";

const LAYOUT_RE = /^\{%\s*layout\s+["']([^"']+)["']\s*%\}\s*\r?\n?/;

/**
 * @param {{ themeRoot: string, templateRel: string, assigns: Record<string, unknown> }} opts
 * @returns {Promise<string>}
 */
export async function renderThemeTemplate({ themeRoot, templateRel, assigns }) {
  const engine = createLiquidEngine({ themeRoot });
  const abs = path.join(themeRoot, templateRel);
  let source = await fs.readFile(abs, "utf8");
  let layoutName = null;
  const m = source.match(LAYOUT_RE);
  if (m) {
    layoutName = m[1];
    source = source.slice(m[0].length);
  }
  const bodyHtml = await engine.parseAndRender(source, assigns);
  if (!layoutName) return bodyHtml;
  const layoutPath = path.join(themeRoot, "layout", `${layoutName}.liquid`);
  const layoutSource = await fs.readFile(layoutPath, "utf8");
  const merged = { ...assigns, content_for_layout: bodyHtml };
  return engine.parseAndRender(layoutSource, merged);
}
