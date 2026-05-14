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

function bool(v) {
  if (v === undefined || v === null || v === "") return undefined;
  if (v === true || v === false) return v;
  const s = String(v).toLowerCase();
  if (s === "true" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  return undefined;
}

export function siteCommand() {
  const site = new Command("site").description("站点与页面");

  site
    .command("list")
    .description("列出站点")
    .option("--page <n>")
    .option("--per-page <n>")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.site.listSites({ page: num(opts.page), per_page: num(opts.perPage) });
      printResult(out, mergedOpts(cmd));
    });

  site
    .command("get")
    .description("获取站点详情")
    .requiredOption("--site-id <id>", "站点 ID")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.site.getSite({ site_id: opts.siteId });
      printResult(out, mergedOpts(cmd));
    });

  const pages = new Command("pages").description("站点页面");

  pages
    .command("list")
    .description("列出页面")
    .requiredOption("--site-id <id>", "站点 ID")
    .option("--keywords <q>", "关键词")
    .option("--parent-id <id>", "父页面")
    .option("--published <bool>", "是否发布")
    .option("--tags <tags>", "标签筛选")
    .option("--page <n>")
    .option("--per-page <n>")
    .option("--include-details", "包含详情（富文本 markdown）")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.site.listPages({
        site_id: opts.siteId,
        keywords: opts.keywords,
        parent_id: opts.parentId,
        published: bool(opts.published),
        tags: opts.tags,
        page: num(opts.page),
        per_page: num(opts.perPage),
        include_details: opts.includeDetails,
      });
      printResult(out, mergedOpts(cmd));
    });

  pages
    .command("get")
    .description("获取页面")
    .requiredOption("--site-id <id>", "站点 ID")
    .requiredOption("--page-id <id>", "页面 ID")
    .option("--full-path <path>", "使用路径代替 page_id")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.site.getPage({
        site_id: opts.siteId,
        page_id: opts.pageId,
        full_path: opts.fullPath,
      });
      printResult(out, mergedOpts(cmd));
    });

  pages
    .command("create")
    .description("创建页面")
    .requiredOption("--site-id <id>", "站点 ID")
    .requiredOption("--name <name>", "标题")
    .requiredOption("--template-name <name>", "模板类型，如 page")
    .option("--parent-id <id>", "父页面")
    .option("--vars <json>", "template_variables JSON")
    .option("--vars-file <path>", "从文件读取 template_variables JSON")
    .option("--published <bool>", "是否发布")
    .option("--position <n>", "排序")
    .action(async (opts, cmd) => {
      let template_variables;
      if (opts.varsFile) {
        template_variables = JSON.parse(await fs.readFile(path.resolve(opts.varsFile), "utf8"));
      } else if (opts.vars) {
        template_variables = JSON.parse(opts.vars);
      }
      const api = await getApi(cmd);
      const out = await api.site.createPage({
        site_id: opts.siteId,
        name: opts.name,
        template_name: opts.templateName,
        parent_id: opts.parentId,
        template_variables,
        published: bool(opts.published),
        position: num(opts.position),
      });
      printResult(out, mergedOpts(cmd));
    });

  pages
    .command("update")
    .description("更新页面")
    .requiredOption("--site-id <id>", "站点 ID")
    .requiredOption("--page-id <id>", "页面 ID")
    .option("--name <name>", "标题")
    .option("--vars <json>", "template_variables JSON")
    .option("--vars-file <path>", "从文件读取 template_variables JSON")
    .option("--published <bool>", "是否发布")
    .option("--position <n>", "排序")
    .option("--full-path <path>", "使用路径代替 page_id")
    .action(async (opts, cmd) => {
      let template_variables;
      if (opts.varsFile) {
        template_variables = JSON.parse(await fs.readFile(path.resolve(opts.varsFile), "utf8"));
      } else if (opts.vars) {
        template_variables = JSON.parse(opts.vars);
      }
      const api = await getApi(cmd);
      const out = await api.site.updatePage({
        site_id: opts.siteId,
        page_id: opts.pageId,
        name: opts.name,
        template_variables,
        published: bool(opts.published),
        position: num(opts.position),
        full_path: opts.fullPath,
      });
      printResult(out, mergedOpts(cmd));
    });

  pages
    .command("delete")
    .description("删除页面")
    .requiredOption("--site-id <id>", "站点 ID")
    .requiredOption("--page-id <id>", "页面 ID")
    .option("--full-path <path>", "使用路径代替 page_id")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.site.deletePage({
        site_id: opts.siteId,
        page_id: opts.pageId,
        full_path: opts.fullPath,
      });
      printResult(out, mergedOpts(cmd));
    });

  pages
    .command("pull")
    .description("导出页面为 JSON（含 template_variables，便于编辑后 update）")
    .requiredOption("--site-id <id>", "站点 ID")
    .requiredOption("--page-id <id>", "页面 ID")
    .requiredOption("--out <path>", "输出 .json 路径")
    .option("--full-path <path>", "使用路径代替 page_id")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const { data } = await api.site.getPage({
        site_id: opts.siteId,
        page_id: opts.pageId,
        full_path: opts.fullPath,
      });
      const target = path.resolve(opts.out);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, JSON.stringify(data, null, 2), "utf8");
      printResult({ ok: true, path: target }, mergedOpts(cmd));
    });

  site.addCommand(pages);

  const tags = new Command("tags").description("站点标签");

  tags
    .command("list")
    .description("列出标签")
    .requiredOption("--site-id <id>", "站点 ID")
    .option("--page <n>")
    .option("--per-page <n>")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.site.listTags({
        site_id: opts.siteId,
        page: num(opts.page),
        per_page: num(opts.perPage),
      });
      printResult(out, mergedOpts(cmd));
    });

  tags
    .command("get")
    .description("获取标签")
    .requiredOption("--site-id <id>", "站点 ID")
    .requiredOption("--tag-id <id>", "标签 ID")
    .option("--name <name>", "按名称查询（query）")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.site.getTag({
        site_id: opts.siteId,
        tag_id: opts.tagId,
        name: opts.name,
      });
      printResult(out, mergedOpts(cmd));
    });

  tags
    .command("create")
    .description("创建标签")
    .requiredOption("--site-id <id>", "站点 ID")
    .requiredOption("--name <name>", "标签名")
    .option("--bg-color <hex>", "背景色")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.site.createTag({
        site_id: opts.siteId,
        name: opts.name,
        bg_color: opts.bgColor,
      });
      printResult(out, mergedOpts(cmd));
    });

  tags
    .command("update")
    .description("更新标签")
    .requiredOption("--site-id <id>", "站点 ID")
    .requiredOption("--tag-id <id>", "标签 ID")
    .option("--name <name>", "新名称")
    .option("--bg-color <hex>", "背景色")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.site.updateTag({
        site_id: opts.siteId,
        tag_id: opts.tagId,
        name: opts.name,
        bg_color: opts.bgColor,
      });
      printResult(out, mergedOpts(cmd));
    });

  tags
    .command("delete")
    .description("删除标签")
    .requiredOption("--site-id <id>", "站点 ID")
    .requiredOption("--tag-id <id>", "标签 ID")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.site.deleteTag({ site_id: opts.siteId, tag_id: opts.tagId });
      printResult(out, mergedOpts(cmd));
    });

  site.addCommand(tags);

  return site;
}
