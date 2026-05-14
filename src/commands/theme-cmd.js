import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { loadBaklibConfig, requireToken } from "../config.js";
import { createBaklibApi } from "../api/index.js";
import { mergedOpts, printResult } from "../lib/cli-output.js";

async function getApi(cmd) {
  const o = mergedOpts(cmd);
  const cfg = await loadBaklibConfig();
  if (o.apiBase) cfg.apiBase = String(o.apiBase).replace(/\/$/, "");
  requireToken(cfg);
  return createBaklibApi(cfg);
}

function num(v) {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function packageRoot() {
  const d = path.dirname(fileURLToPath(import.meta.url));
  if (path.basename(d) === "dist") return path.join(d, "..");
  return path.resolve(d, "..", "..");
}

/** 与 baklib-tools/skills 中 create-theme-scaffold 对齐的最小骨架 */
const SCAFFOLD_FILES = {
  "config/settings_schema.json": (name, scope) =>
    JSON.stringify(
      [{ name: "theme_info", theme_name: name, theme_version: "0.0.1", theme_scope: scope }],
      null,
      2,
    ),
  "layout/theme.liquid": () =>
    `<!doctype html>
<html>
<head>
  {% meta_tags %}
  {{ 'stylesheets/application.css' | asset_url | stylesheet_tag }}
</head>
<body>
  {% render 'header' %}
  {{ content_for_layout }}
  {% render 'footer' %}
</body>
</html>
`,
  "templates/index.liquid": () =>
    `{% layout "theme" %}
<h1>{{ site.name }}</h1>
<p>首页预览（baklib-cli theme dev）</p>
`,
  "templates/page.liquid": () =>
    `{% layout "theme" %}
<article>
  <h1>{{ page.name }}</h1>
  <div class="content">{{ page.content }}</div>
</article>
`,
  "snippets/_header.liquid": () => `<header><strong>{{ site.name }}</strong></header>`,
  "snippets/_footer.liquid": () => `<footer><small>Theme preview</small></footer>`,
  "locales/zh-CN.json": () => JSON.stringify({}, null, 2),
  "locales/en.json": () => JSON.stringify({}, null, 2),
  "src/stylesheets/application.css": () => `body { font-family: system-ui, sans-serif; margin: 1rem; }`,
  "README.md": (name, scope) => `# ${name} (${scope})\n\n使用 \`baklib theme dev --theme-dir .\` 在本地预览。\n`,
  "package.json": (name) =>
    JSON.stringify({ name: `baklib-theme-${name}`, private: true, version: "0.0.1", scripts: {} }, null, 2),
};

export function themeCommand() {
  const theme = new Command("theme").description("模板 / 主题");

  theme
    .command("list")
    .description("列出模板（对齐 Open API GET /themes）")
    .option("--from <org|public>", "来源")
    .option("--scope <cms|wiki>", "应用类型")
    .option("--page <n>")
    .option("--per-page <n>")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.theme.listThemes({
        from: opts.from,
        scope: opts.scope,
        page: num(opts.page),
        per_page: num(opts.perPage),
      });
      printResult(out, mergedOpts(cmd));
    });

  theme
    .command("init")
    .description("新建主题目录骨架 themes/<scope>/<name>/")
    .argument("<scope>", "cms | wiki | community")
    .argument("<name>", "主题名（小写、数字、下划线）")
    .option("--force", "目录非空时仍写入文件")
    .action(async (scope, name, opts, cmd) => {
      const valid = /^(cms|wiki|community)$/.test(scope);
      if (!valid) throw new Error("scope 须为 cms、wiki 或 community");
      if (!/^[a-z0-9_]{3,50}$/.test(name)) throw new Error("主题名须 3–50 字符，仅小写字母、数字、下划线");
      const root = path.join(process.cwd(), "themes", scope, name);
      await fs.mkdir(root, { recursive: true });
      for (const [rel, fn] of Object.entries(SCAFFOLD_FILES)) {
        const full = path.join(root, rel);
        await fs.mkdir(path.dirname(full), { recursive: true });
        try {
          await fs.access(full);
          if (!opts.force) {
            throw new Error(`已存在文件（加 --force 覆盖）: ${full}`);
          }
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        const content = typeof fn === "function" ? fn(name, scope) : fn;
        await fs.writeFile(full, content, "utf8");
      }
      printResult(
        {
          ok: true,
          path: root,
          next: "运行: baklib theme dev --theme-dir " + root + " --site-id <你的站点ID>",
        },
        mergedOpts(cmd),
      );
    });

  theme
    .command("dev")
    .description("启动本地主题预览（Vite + React + Liquid，需 Token）")
    .requiredOption("--site-id <id>", "用于拉取 fixture 的站点 ID")
    .option("--theme-dir <path>", "主题根目录（默认 cwd）", process.cwd())
    .option("--port <n>", "端口", "5174")
    .action(async (opts, cmd) => {
      const cfg = await loadBaklibConfig();
      const m = mergedOpts(cmd);
      if (m.apiBase) cfg.apiBase = String(m.apiBase).replace(/\/$/, "");
      requireToken(cfg);
      process.env.BAKLIB_MCP_TOKEN = cfg.token;
      process.env.BAKLIB_MCP_API_BASE = cfg.apiBase;
      process.env.BAKLIB_PREVIEW_SITE_ID = opts.siteId;
      process.env.BAKLIB_THEME_DIR = path.resolve(opts.themeDir);
      const port = num(opts.port) ?? 5174;
      const { createServer } = await import("vite");
      const react = (await import("@vitejs/plugin-react")).default;
      const pluginUrl = pathToFileURL(path.join(packageRoot(), "theme-preview", "vite-plugin-preview.js")).href;
      const { baklibPreviewPlugin } = await import(pluginUrl);
      const root = path.join(packageRoot(), "theme-preview");
      const server = await createServer({
        root,
        configFile: false,
        plugins: [react(), baklibPreviewPlugin()],
        server: {
          port,
          strictPort: false,
          fs: { allow: [packageRoot(), path.resolve(opts.themeDir)] },
        },
      });
      await server.listen();
      server.printUrls();
    });

  return theme;
}
