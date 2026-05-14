import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import { loadBaklibConfig, requireToken, resolveOpenApiBaseUrl } from "../config.js";
import { createBaklibApi } from "../api/index.js";
import { mergedOpts, printResult } from "../lib/cli-output.js";

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

function parseFrontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/m.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const head = m[1];
  const body = m[2];
  /** @type {Record<string, string>} */
  const meta = {};
  for (const line of head.split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body };
}

export function kbCommand() {
  const kb = new Command("kb").description("知识库 KB");

  kb.command("spaces")
    .description("列出知识库")
    .option("--page <n>")
    .option("--per-page <n>")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.kb.listKnowledgeBases({ page: num(opts.page), per_page: num(opts.perPage) });
      printResult(out, mergedOpts(cmd));
    });

  kb.command("space")
    .description("获取知识库详情")
    .requiredOption("--space-id <id>", "知识库 ID")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.kb.getKnowledgeBase({ space_id: opts.spaceId });
      printResult(out, mergedOpts(cmd));
    });

  kb.command("articles")
    .description("列出文章")
    .requiredOption("--space-id <id>", "知识库 ID")
    .option("--keywords <q>", "搜索")
    .option("--parent-id <id>", "父文章")
    .option("--page <n>")
    .option("--per-page <n>")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.kb.listArticles({
        space_id: opts.spaceId,
        keywords: opts.keywords,
        parent_id: opts.parentId,
        page: num(opts.page),
        per_page: num(opts.perPage),
      });
      printResult(out, mergedOpts(cmd));
    });

  kb.command("article")
    .description("获取文章")
    .requiredOption("--space-id <id>", "知识库 ID")
    .requiredOption("--article-id <id>", "文章 ID")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.kb.getArticle({ space_id: opts.spaceId, article_id: opts.articleId });
      printResult(out, mergedOpts(cmd));
    });

  kb.command("create")
    .description("创建文章")
    .requiredOption("--space-id <id>", "知识库 ID")
    .requiredOption("--title <title>", "标题")
    .option("--body <markdown>", "正文")
    .option("--parent-id <id>", "父文章")
    .option("--position <p>", "排序")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.kb.createArticle({
        space_id: opts.spaceId,
        title: opts.title,
        body: opts.body,
        parent_id: opts.parentId,
        position: opts.position,
      });
      printResult(out, mergedOpts(cmd));
    });

  kb.command("update")
    .description("更新文章")
    .requiredOption("--space-id <id>", "知识库 ID")
    .requiredOption("--article-id <id>", "文章 ID")
    .option("--title <title>", "标题")
    .option("--body <markdown>", "正文")
    .option("--parent-id <id>", "父文章")
    .option("--position <p>", "排序")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.kb.updateArticle({
        space_id: opts.spaceId,
        article_id: opts.articleId,
        title: opts.title,
        body: opts.body,
        parent_id: opts.parentId,
        position: opts.position,
      });
      printResult(out, mergedOpts(cmd));
    });

  kb.command("delete")
    .description("删除文章")
    .requiredOption("--space-id <id>", "知识库 ID")
    .requiredOption("--article-id <id>", "文章 ID")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.kb.deleteArticle({ space_id: opts.spaceId, article_id: opts.articleId });
      printResult(out, mergedOpts(cmd));
    });

  kb.command("pull")
    .description("将单篇文章导出为 Markdown（含 YAML frontmatter）")
    .requiredOption("--space-id <id>", "知识库 ID")
    .requiredOption("--article-id <id>", "文章 ID")
    .requiredOption("--out <path>", "输出文件路径")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const { data } = await api.kb.getArticle({ space_id: opts.spaceId, article_id: opts.articleId });
      const attrs = data?.attributes || {};
      const title = attrs.title || "";
      const body = attrs.body || "";
      const front = [
        "---",
        `space_id: "${opts.spaceId}"`,
        `article_id: "${opts.articleId}"`,
        `title: ${JSON.stringify(title)}`,
        "---",
        "",
      ].join("\n");
      const target = path.resolve(opts.out);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, front + body, "utf8");
      printResult({ ok: true, path: target }, mergedOpts(cmd));
    });

  kb.command("push")
    .description("从 Markdown 文件创建或更新文章（读取 frontmatter 中 space_id / article_id / title）")
    .requiredOption("--file <path>", "Markdown 文件")
    .action(async (opts, cmd) => {
      const raw = await fs.readFile(path.resolve(opts.file), "utf8");
      const { meta, body } = parseFrontmatter(raw);
      const space_id = meta.space_id;
      const title = meta.title;
      const article_id = meta.article_id;
      if (!space_id || !title) throw new Error("frontmatter 需包含 space_id 与 title");
      const api = await getApi(cmd);
      const out = article_id
        ? await api.kb.updateArticle({
            space_id,
            article_id,
            title,
            body,
          })
        : await api.kb.createArticle({
            space_id,
            title,
            body,
            parent_id: meta.parent_id,
          });
      printResult(out, mergedOpts(cmd));
    });

  return kb;
}
