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
import { THEME_PREVIEW_ADMIN_PANEL_PATH } from "../lib/theme-preview-constants.js";
import { ensureThemePreviewWorkspace } from "../lib/theme-preview-workdir.js";

/** 与 Open API `GET /themes/:ref` 一致：路径参数为接口返回的主题 id（hashid）或 `scope/name` */
const THEME_REF_ARGUMENT_DESC =
  "主题 id（theme list / theme show 返回），或 scope/name（如 cms/guide）";

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

/** 主题目录相对当前工作目录的展示路径（如 cms--vcard/） */
function themeInitDirDisplayRelative(themeRootAbs) {
  const cwd = process.cwd();
  const abs = path.resolve(themeRootAbs);
  let rel = path.relative(cwd, abs);
  rel = rel.split(path.sep).join("/");
  if (!rel || rel.startsWith("..")) {
    rel = path.basename(abs);
  }
  return rel.endsWith("/") ? rel : `${rel}/`;
}

/** @param {string} themeRootAbs */
function printThemeInitSuccessHuman(themeRootAbs) {
  const sub = themeInitDirDisplayRelative(themeRootAbs);
  const cdTarget = sub.replace(/\/$/, "");
  console.log("主题初始化成功。");
  console.log(`已在当前目录下创建子目录 ${sub}`);
  console.log("");
  console.log("若尚未安装主题模版开发技能（baklib-theme-dev），请在本目录执行：");
  console.log("    baklib skill install");
  console.log("");
  console.log("请进入模版目录后执行本地预览：");
  console.log(`    cd ./${cdTarget}`);
  console.log("    baklib theme dev");
  console.log(`（启动后在终端提示的地址打开管理面板 ${THEME_PREVIEW_ADMIN_PANEL_PATH}，选择站点并开启同步）`);
  console.log("");
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
  "README.md": (name, scope) => `# ${name} (${scope})\n\n进入本目录后执行 \`baklib theme dev\` 在本地预览。\n`,
  "package.json": (name) =>
    JSON.stringify({ name: `baklib-theme-${name}`, private: true, version: "0.0.1", scripts: {} }, null, 2),
};

export function themeCommand() {
  const theme = new Command("theme").description("站点模板：列表、详情、拉取、预览上传、脚手架与本地开发");

  theme
    .command("list")
    .description("列出平台模板")
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
    .description("查看模板详情")
    .argument("<theme>", THEME_REF_ARGUMENT_DESC)
    .action(async (themeArg, opts, cmd) => {
      const api = await getApi(cmd);
      const m = mergedOpts(cmd);
      const ref = themeArg && String(themeArg).trim();
      if (!ref) throw new Error("请指定主题，例如: baklib theme show <id> 或 baklib theme show cms/guide");
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
    .description("下载主题文件到本地")
    .argument("<theme>", THEME_REF_ARGUMENT_DESC)
    .option("--dir <path>", "主题 Git 工作区根；指定时默认写入同一路径（可用 --out 覆盖）")
    .option("--out <dir>", "输出根目录；未指定时与 --dir 或当前工作目录一致")
    .option("--version-id <id>", "版本 id（theme show 中分支/标签的 version_id）")
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
      if (!themeRef) throw new Error("请指定主题，例如: baklib theme pull <id> 或 baklib theme pull cms/guide");

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
    .description("将本地主题上传到服务端预览缓存（非正式上架）")
    .option("--theme-dir <path>", "主题根目录（默认 cwd）", process.cwd())
    .option("--entry <rel>", "入口模板（相对主题根）", "templates/index.liquid")
    .option("--locale <tag>", "locales 语言（默认从 LANG 推导）")
    .option("--site-id <id>", "与 --page-id 联用：校验预览 HTML")
    .option("--page-id <id>", "与 --site-id 联用：校验预览 HTML")
    .option("--keep-session", "保留预览会话（默认结束后删除）")
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
    .description("在当前目录创建 <scope>--<name>/ 主题骨架")
    .argument("[scope]", "cms | wiki | community")
    .argument("[name]", "主题名（小写、数字、下划线）")
    .option("--force", "目录非空时仍写入文件")
    .addHelpText("after", "\n在当前目录创建 `<scope>--<name>/`（如 `cms--vcard/`）。技能需单独安装，见 `baklib skill install`。\n示例: baklib theme init cms vcard\n")
    .action(async (scopeRaw, nameRaw, opts, cmd) => {
      const scope = typeof scopeRaw === "string" ? scopeRaw.trim() : "";
      const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
      if (!scope || !name) {
        console.error("");
        console.error("错误：请指定 scope 与 name。");
        console.error("  用法: baklib theme init <scope> <name>");
        console.error("  scope: cms | wiki | community");
        console.error("  name:  3–50 字符，仅小写字母、数字、下划线");
        console.error("  示例: baklib theme init cms vcard  →  目录 ./cms--vcard/");
        console.error("");
        process.exit(1);
      }
      const valid = /^(cms|wiki|community)$/.test(scope);
      if (!valid) throw new Error("scope 须为 cms、wiki 或 community");
      if (!/^[a-z0-9_]{3,50}$/.test(name)) throw new Error("主题名须 3–50 字符，仅小写字母、数字、下划线");
      const root = path.join(process.cwd(), `${scope}--${name}`);
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
      const m = mergedOpts(cmd);
      const subRel = themeInitDirDisplayRelative(root).replace(/\/$/, "");
      if (m.json) {
        printResult(
          {
            message: "主题初始化成功",
            theme_subdirectory: subRel,
            install_skill_if_needed: "baklib skill install",
            cd: `cd ./${subRel}`,
            dev: "baklib theme dev",
            admin_panel_path: THEME_PREVIEW_ADMIN_PANEL_PATH,
          },
          m,
        );
      } else {
        printThemeInitSuccessHuman(root);
      }
    });

  theme
    .command("dev")
    .description("启动本地主题预览与开发面板")
    .option("--theme-dir <path>", "主题根目录（默认 cwd）", process.cwd())
    .option("--port <n>", "开发服务器监听端口", "5174")
    .option(
      "--recopy-preview",
      "删除当前包版本在用户缓存下的 theme dev 工作台，从安装包重新复制 theme-preview、src/lib、src/api 并重新 npm install（排障或强制同步本地改动到缓存时可用）",
    )
    .option(
      "--reload-delay <seconds>",
      "预览页在模板同步成功后热更新的延迟（秒，默认 1）；也可用环境变量 BAKLIB_PREVIEW_RELOAD_DELAY_MS",
      "1",
    )
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
      const reloadDelaySec = Number(opts.reloadDelay);
      if (Number.isFinite(reloadDelaySec) && reloadDelaySec >= 0) {
        process.env.BAKLIB_PREVIEW_RELOAD_DELAY_MS = String(Math.round(reloadDelaySec * 1000));
      }
      const port = num(opts.port) ?? 5174;

      const { workspaceRoot, themePreviewRoot } = await ensureThemePreviewWorkspace({
        quiet: m.json,
        recopyPreview: Boolean(opts.recopyPreview),
      });

      const { createServer } = await import("vite");
      const root = themePreviewRoot;
      const server = await createServer({
        root,
        configFile: path.join(root, "vite.config.ts"),
        appType: "spa",
        server: {
          port,
          strictPort: false,
          fs: { allow: [workspaceRoot, themeRootResolved] },
        },
      });
      await server.listen();
      server.printUrls();
      const addr = server.httpServer?.address?.();
      const listenPort =
        typeof addr === "object" && addr && typeof addr.port === "number" ? addr.port : port;
      process.env.BAKLIB_PREVIEW_ORIGIN = `http://127.0.0.1:${listenPort}`;
      if (!m.json) {
        console.error(
          `[theme-preview] 管理面板: http://localhost:${listenPort}${THEME_PREVIEW_ADMIN_PANEL_PATH}`,
        );
        console.error(
          "[theme-preview] 启动完成：请在管理面板右侧打开「同步模版到预览」以创建会话并上传主题",
        );
      }

      const previewRuntimePath = path.join(themePreviewRoot, "server/preview-sync-runtime.js");
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
