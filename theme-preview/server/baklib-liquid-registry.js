import fs from "fs/promises";
import path from "path";
import { Liquid } from "liquidjs";

/**
 * Baklib 主题预览用 Liquid：实现 meta_tags、asset_url、stylesheet_tag；{% render 'x' %} 映射 snippets/_x.liquid
 * 完整行为以 baklib-theme-dev references 为准，此处为 Node/liquidjs 子集。
 *
 * @param {{ themeRoot: string }} opts
 */
export function createLiquidEngine({ themeRoot }) {
  const engine = new Liquid({
    root: [path.join(themeRoot, "layout"), path.join(themeRoot, "templates"), path.join(themeRoot, "snippets")],
    extname: ".liquid",
    strictFilters: false,
    strictVariables: false,
  });

  engine.registerFilter("asset_url", (input) => {
    if (input == null) return "";
    const s = String(input).replace(/^\//, "");
    return `/__theme_asset/${encodeURI(s)}`;
  });

  engine.registerFilter("stylesheet_tag", (href) => {
    if (!href) return "";
    return `<link rel="stylesheet" href="${String(href)}" data-baklib-cli-preview="1" />`;
  });

  engine.registerTag("meta_tags", {
    /** @param {import('liquidjs').Token} tagToken */
    parse(tagToken) {
      this.token = tagToken;
    },
    render(ctx) {
      const site = ctx.get(["site"]) || {};
      const page = ctx.get(["page"]) || {};
      const title = page.name || site.name || "Preview";
      return `<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(
        title,
      )}</title>`;
    },
  });

  engine.registerTag("render", {
    parse(tagToken) {
      const m = /['"]([^'"]+)['"]/.exec(tagToken.args);
      this.snippet = m ? m[1] : tagToken.args.trim();
    },
    async render(ctx) {
      const name = this.snippet;
      const candidates = [
        path.join(themeRoot, "snippets", `_${name}.liquid`),
        path.join(themeRoot, "snippets", `${name}.liquid`),
      ];
      let src = "";
      for (const p of candidates) {
        try {
          src = await fs.readFile(p, "utf8");
          break;
        } catch {
          /* try next */
        }
      }
      if (!src) return `<!-- missing snippet: ${name} -->`;
      return engine.parseAndRender(src, ctx.getAll(), ctx.opts);
    },
  });

  return engine;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
