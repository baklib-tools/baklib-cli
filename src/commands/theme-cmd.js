import { Command } from "commander";
import { execFileSync } from "child_process";
import readline from "node:readline/promises";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { loadBaklibConfig, requireToken, resolveOpenApiBaseUrl, openApiHostFromResolvedBase } from "../config.js";
import { createBaklibApi } from "../api/index.js";
import { themePreviewSessionIdFromResponse } from "../api/ops-theme-preview.js";
import { mergedOpts, printResult, formatThemeSummaryHumanLine } from "../lib/cli-output.js";
import { resolveThemePullRoots } from "../lib/theme-pull-paths.js";
import { buildThemePreviewFilesMap } from "../lib/theme-preview-liquid-deps.js";
import { resolvePreviewLocale } from "../lib/theme-preview-locale.js";

async function getApi(cmd) {
  const o = mergedOpts(cmd);
  const cfg = await loadBaklibConfig();
  if (o.apiBase) cfg.apiBase = resolveOpenApiBaseUrl(String(o.apiBase));
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

/** @param {string} cwd */
function readGitMeta(cwd) {
  try {
    const inside = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf8" }).trim();
    if (inside !== "true") return null;
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8" }).trim();
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
    return { insideWorkTree: true, branch, head };
  } catch {
    return null;
  }
}

/**
 * @template T, R
 * @param {number} limit
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} fn
 */
async function mapPool(limit, items, fn) {
  /** @type {Promise<R>[]} */
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * @param {{ done: number, total: number, path: string }} p
 */
function ttyProgress(p) {
  if (!process.stdout.isTTY) return;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const tail = p.path.length > 52 ? `…${p.path.slice(-52)}` : p.path;
  process.stdout.write(`\r下载 [${p.done}/${p.total}] ${pct}%  ${tail.padEnd(55, " ").slice(0, 55)}`);
}

/**
 * @param {boolean} jsonMode
 * @param {unknown} manifestOid
 * @param {{ head?: string } | null} git
 * @returns {string[]}
 */
function themePullHeadWarnings(jsonMode, manifestOid, git) {
  const oid = typeof manifestOid === "string" ? manifestOid.trim() : "";
  const head = git?.head && String(git.head).trim();
  if (!oid || !head) return [];
  const na = oid.toLowerCase().replace(/\s/g, "");
  const nb = head.toLowerCase().replace(/\s/g, "");
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (long.startsWith(short)) return [];
  const msg = `本地 Git HEAD（${head.slice(0, 7)}）与清单版本 commit_oid（${oid.slice(0, 7)}）不一致；若以平台版本为准可忽略`;
  if (!jsonMode) console.error(msg);
  return [msg];
}

/** @param {Record<string, unknown>} t */
function printThemeShowDetailHuman(t) {
  console.log(formatThemeSummaryHumanLine(t));
  const lines = [
    `公开: ${t.public ? "是" : "否"}`,
    t.published_at ? `上架时间: ${String(t.published_at).slice(0, 19).replace("T", " ")}` : null,
    t.git_remote_url ? `Git 仓库: ${t.git_remote_url}` : "Git 仓库: （未配置）",
    t.git_branch_name ? `平台记录的分支名: ${t.git_branch_name}` : null,
    `分支数: ${t.branches_count ?? "—"} · 标签数: ${t.tags_count ?? "—"} · 在用站点数: ${t.active_sites_count ?? "—"}`,
  ].filter(Boolean);
  if (Array.isArray(t.branches) && t.branches.length) {
    lines.push("分支:", ...t.branches.map((b) => `  · ${b.name}  (version_id: ${b.version_id})`));
  }
  if (Array.isArray(t.tags) && t.tags.length) {
    lines.push("标签:", ...t.tags.map((x) => `  · ${x.name}  (version_id: ${x.version_id})`));
  }
  console.log(lines.join("\n"));
}

/**
 * @param {{ yes: boolean, json: boolean, fileCount: number, outRoot: string }} p
 * @returns {Promise<boolean>}
 */
async function confirmThemePullWrite(p) {
  if (p.yes || p.json) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("未检测到交互式终端：请先查看清单，再使用 --yes 确认写入。");
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const msg = [
      "",
      `即将写入 ${p.fileCount} 个文件到目录:`,
      `  ${p.outRoot}`,
      "（完成后会写入或覆盖 .baklib-theme.json）",
      "",
      "确认继续? [y/N] ",
    ].join("\n");
    const answer = await rl.question(msg);
    return /^y(es)?$/i.test(String(answer).trim());
  } finally {
    rl.close();
  }
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
  const theme = new Command("theme").description("站点模板 / 主题：列出与拉取、推送预览缓存、脚手架、本地开发预览");

  theme
    .command("list")
    .description("列出模板（全量；GET /themes?all=true）")
    .option("--from <org|public>", "默认不传：自有+已发布共享+官方；org 仅自有；public 仅官方")
    .option("--scope <cms|wiki>", "应用类型")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.theme.listThemes({
        from: opts.from,
        scope: opts.scope,
      });
      printResult(out, mergedOpts(cmd));
    });

  theme
    .command("show")
    .description("查看模板详情；scope/name 若命中多个会列出全部，请再用 id 指定")
    .argument("<theme>", "主题 hashid / 数字 id，或 scope/name（如 cms/guide）")
    .action(async (themeArg, opts, cmd) => {
      const api = await getApi(cmd);
      const m = mergedOpts(cmd);
      const ref = themeArg && String(themeArg).trim();
      if (!ref) throw new Error("请指定主题，例如: baklib theme show 3 或 baklib theme show cms/guide");
      const out = await api.theme.getThemeShow({ theme_ref: ref });
      const ambiguous = Array.isArray(out.themes) && out.themes.length > 1;
      if (ambiguous) {
        if (!m.json) {
          console.log(
            `存在 ${out.themes.length} 个可选模板与此 scope/name 相同（例如组织自有与官方同名），请用主题 id 执行 pull/show 单个：\n`,
          );
          out.themes.forEach((t, i) => {
            console.log(`— 候选 ${i + 1} —`);
            printThemeShowDetailHuman(t);
            console.log("");
          });
        } else {
          printResult({ success: true, themes: out.themes }, m);
        }
        return;
      }
      const t = out.theme;
      if (!t) throw new Error("接口未返回 theme 字段");
      if (!m.json) {
        printThemeShowDetailHuman(t);
      } else {
        printResult(out, m);
      }
    });

  theme
    .command("pull")
    .description("按清单逐文件下载主题版本（默认 main；可用 --version-name / --branch 或 tag:v1）")
    .argument("<theme>", "主题 hashid / 数字 id，或 scope/name（如 cms/guide）")
    .option("--dir <path>", "主题 Git 工作区根；指定时默认写入同一路径（可用 --out 覆盖）")
    .option("--out <dir>", "输出根目录；未指定时与 --dir 或当前工作目录一致")
    .option("--version-id <id>", "Theme::Version hashid")
    .option("--version-name <name>", "分支名 / 标签名，或 branch:main / tag:v1.0（未指定时服务端默认 main）")
    .option("--branch <name>", "同 --version-name，便于指定分支")
    .option("--commit-oid <oid>", "Git commit oid")
    .option("--commit-hash <hash>", "commit hash")
    .option("--use-git-branch", "在 Git 工作区根（见 --dir）读取当前分支名作为 version_name")
    .option("--concurrency <n>", "并发下载数", "4")
    .option("-y, --yes", "跳过写入前确认（非交互环境必须使用）")
    .action(async (themeArg, opts, cmd) => {
      const api = await getApi(cmd);
      const m = mergedOpts(cmd);
      const { outRoot, gitRoot } = resolveThemePullRoots({ dir: opts.dir, out: opts.out }, process.cwd());

      const themeRef = themeArg && String(themeArg).trim();
      if (!themeRef) throw new Error("请指定主题，例如: baklib theme pull 3 或 baklib theme pull cms/guide");

      let versionName = opts.versionName || opts.branch;
      if (opts.useGitBranch) {
        const g = readGitMeta(gitRoot);
        if (!g?.insideWorkTree || !g.branch || g.branch === "HEAD") {
          throw new Error("Git 工作区根下不是 git 仓库或未检出分支，无法使用 --use-git-branch（请检查 --dir / --out）");
        }
        versionName = g.branch;
      }

      const manifestArgs = {
        theme_ref: themeRef,
        version_id: opts.versionId,
        version_name: versionName,
        commit_oid: opts.commitOid,
        commit_hash: opts.commitHash,
      };
      const mfRes = await api.theme.getThemeManifest(manifestArgs);
      const manifest = mfRes.manifest;
      const files = Array.isArray(manifest.files) ? manifest.files : [];
      const gitMeta = readGitMeta(gitRoot);
      const warnings = themePullHeadWarnings(m.json, manifest.version?.commit_oid, gitMeta);

      if (m.json) {
        console.error(
          JSON.stringify({
            type: "baklib_theme_pull_manifest",
            theme: manifest.theme,
            version: manifest.version,
            file_count: files.length,
            out: outRoot,
            git_root: gitRoot,
          }),
        );
      } else {
        console.error(
          `主题 ${manifest.theme?.name} (${manifest.theme?.scope}) · 版本 ${manifest.version?.label || manifest.version?.id} · 共 ${files.length} 个文件 → ${outRoot}`,
        );
        for (const f of files) {
          console.error(`  · ${f.path}${f.byte_size != null ? ` (${f.byte_size} B)` : ""}`);
        }
      }

      const okWrite = await confirmThemePullWrite({
        yes: Boolean(opts.yes),
        json: Boolean(m.json),
        fileCount: files.length,
        outRoot,
      });
      if (!okWrite) {
        if (!m.json) console.error("已取消，未写入任何文件。");
        return;
      }

      await fs.mkdir(outRoot, { recursive: true });

      const conc = num(opts.concurrency) ?? 4;
      const errors = [];
      /** @type {{ path: string, ok: boolean, bytes?: number, error?: string }[]} */
      const fileResults = [];
      let progressChain = Promise.resolve();
      let completed = 0;

      /**
       * @param {string} displayPath
       * @param {{ path: string, ok: boolean, bytes?: number, error?: string }} entry
       */
      const bump = (displayPath, entry) => {
        progressChain = progressChain.then(() => {
          completed += 1;
          fileResults.push(entry);
          if (m.json) {
            console.error(
              JSON.stringify({
                type: "baklib_theme_pull_progress",
                done: completed,
                total: files.length,
                path: entry.path,
                ok: entry.ok,
                bytes: entry.bytes,
                error: entry.error,
              }),
            );
          } else if (!process.stdout.isTTY) {
            console.error(`[theme pull] ${completed}/${files.length} ${displayPath}`);
          }
          ttyProgress({ done: completed, total: files.length, path: displayPath });
        });
        return progressChain;
      };

      await mapPool(conc, files, async (f) => {
        try {
          const buf = await api.theme.downloadThemeFile({ download_path: f.download_path });
          const dest = path.join(outRoot, f.path);
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.writeFile(dest, buf);
          await bump(f.path, { path: f.path, ok: true, bytes: buf.byteLength });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          errors.push({ path: f.path, message });
          await bump(`${f.path} (失败)`, { path: f.path, ok: false, error: message });
        }
      });

      await progressChain;
      if (process.stdout.isTTY) process.stdout.write("\n");

      const sidecar = {
        pulled_at: new Date().toISOString(),
        theme_id: manifest.theme?.id,
        version: manifest.version,
        git: gitMeta,
        git_root: gitRoot,
        out: outRoot,
        errors,
        warnings,
      };
      await fs.writeFile(path.join(outRoot, ".baklib-theme.json"), JSON.stringify(sidecar, null, 2), "utf8");

      const result = {
        success: errors.length === 0,
        ok: errors.length === 0,
        out: outRoot,
        git_root: gitRoot,
        theme: manifest.theme,
        version: manifest.version,
        file_count: files.length,
        files: m.json ? files : undefined,
        file_results: m.json ? fileResults : undefined,
        warnings: warnings.length ? warnings : undefined,
        errors,
        git: gitMeta,
      };
      printResult(result, m);
      if (errors.length) process.exitCode = 1;
    });

  theme
    .command("push")
    .description(
      "将本地主题按入口 Liquid 依赖 + 当前语言 locales 经 Open API 上传到 Baklib「主题预览」服务端缓存（供路径预览等）。非模板库正式发布；上架版本请走组织后台或 Git。",
    )
    .option("--theme-dir <path>", "主题根目录（默认 cwd）", process.cwd())
    .option("--entry <rel>", "入口模板（相对主题根）", "templates/index.liquid")
    .option("--locale <tag>", "locales 语言标签（未传则从 LANG/LC_ALL 推导）")
    .option("--site-id <id>", "与 --page-id 同时传入时额外请求服务端渲染 HTML")
    .option("--page-id <id>", "页面 id / hashid（与 --site-id 同时传入时用 preview_render 拉一段服务端 HTML，需能从 Open API 读到 full_path）")
    .option("--keep-session", "上传完成后保留预览会话（默认删除）")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const m = mergedOpts(cmd);
      const themeRootResolved = path.resolve(opts.themeDir);
      const locale = resolvePreviewLocale(opts.locale);
      const entryRel = opts.entry || "templates/index.liquid";
      const sess = await api.themePreview.createSession();
      const sessionId = themePreviewSessionIdFromResponse(sess);
      if (!sessionId) {
        throw new Error(`创建预览会话失败：响应中无 session_id。请使用 BAKLIB_CLI_TRACE=1 重试并核对 Open API 地址与版本。响应: ${JSON.stringify(sess)}`);
      }
      const files = await buildThemePreviewFilesMap({
        themeRoot: themeRootResolved,
        entryRel,
        locale,
      });
      const sync = await api.themePreview.sync({ sessionId, files });
      /** @type {Record<string, unknown>} */
      const out = {
        success: true,
        session_id: sessionId,
        expires_in: sess.expires_in,
        synced: sync.synced,
        paths: Object.keys(files),
      };
      if (opts.siteId && opts.pageId) {
        const detail = await api.site.getPage({ site_id: String(opts.siteId), page_id: String(opts.pageId) });
        const attrs = detail.full_response?.data?.attributes || detail.data?.attributes || {};
        const raw = attrs.full_path ?? attrs["full-path"];
        if (raw == null || String(raw).trim() === "") {
          throw new Error("无法从页面详情读取 full_path，请核对 --site-id 与 --page-id（须为可访问的页面 id / hashid）。");
        }
        let pagePath = String(raw).trim();
        if (!pagePath.startsWith("/")) pagePath = `/${pagePath}`;
        if (pagePath.length > 1 && pagePath.endsWith("/")) pagePath = pagePath.slice(0, -1);
        const rendered = await api.themePreview.previewRender({
          sessionId,
          site_id: String(opts.siteId),
          path: pagePath || "/",
        });
        out.html_length = typeof rendered.html === "string" ? rendered.html.length : 0;
      }
      if (!opts.keepSession) {
        await api.themePreview.deleteSession({ sessionId });
        out.session_deleted = true;
      }
      printResult(out, m);
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
          next: "运行: baklib theme dev --theme-dir " + root + "（在 /!/theme-admin-panel 中选择站点并开启同步）",
        },
        mergedOpts(cmd),
      );
    });

  theme
    .command("dev")
    .description("启动本地主题开发（控制面板；在面板中开启预览同步后会话 + 路径 HTML 预览）")
    .option("--theme-dir <path>", "主题根目录（默认 cwd）", process.cwd())
    .option("--port <n>", "开发服务器监听端口", "5174")
    .action(async (opts, cmd) => {
      const cfg = await loadBaklibConfig();
      const m = mergedOpts(cmd);
      if (m.apiBase) cfg.apiBase = resolveOpenApiBaseUrl(String(m.apiBase));
      requireToken(cfg);
      process.env.BAKLIB_TOKEN = cfg.token;
      process.env.BAKLIB_API_BASE = openApiHostFromResolvedBase(cfg.apiBase);
      delete process.env.BAKLIB_PREVIEW_SITE_ID;
      const themeRootResolved = path.resolve(opts.themeDir);
      process.env.BAKLIB_THEME_DIR = themeRootResolved;
      const locale = resolvePreviewLocale(undefined);
      const entryRel = "templates/index.liquid";
      process.env.BAKLIB_PREVIEW_ENTRY = entryRel;
      process.env.BAKLIB_PREVIEW_LOCALE = locale;
      const port = num(opts.port) ?? 5174;

      const { createServer } = await import("vite");
      const root = path.join(packageRoot(), "theme-preview");
      const server = await createServer({
        root,
        configFile: path.join(root, "vite.config.ts"),
        appType: "spa",
        server: {
          port,
          strictPort: false,
          fs: { allow: [packageRoot(), themeRootResolved] },
        },
      });
      await server.listen();
      server.printUrls();
      const addr = server.httpServer?.address?.();
      const listenPort =
        typeof addr === "object" && addr && typeof addr.port === "number" ? addr.port : port;
      process.env.BAKLIB_PREVIEW_ORIGIN = `http://127.0.0.1:${listenPort}`;
      if (!m.json) {
        console.error(`[theme-preview] 管理面板: http://localhost:${listenPort}/!/theme-admin-panel`);
        console.error(
          "[theme-preview] 启动完成：请在管理面板右侧打开「同步模版到预览」以创建会话并上传主题",
        );
      }

      const previewRuntimePath = path.join(packageRoot(), "theme-preview/server/preview-sync-runtime.js");
      const { shutdownPreviewSyncRuntime } = await import(pathToFileURL(previewRuntimePath).href);

      const onShutdown = async () => {
        await shutdownPreviewSyncRuntime();
        await server.close();
      };

      process.once("SIGINT", () => {
        onShutdown().finally(() => process.exit(0));
      });
    });

  return theme;
}
