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

export function damCommand() {
  const dam = new Command("dam").description("资源库 DAM：文件、片段、链接与合集");

  dam
    .command("upload")
    .description("上传文件")
    .requiredOption("--file-path <path>", "本地文件路径")
    .option("--name <name>", "文件名")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.dam.uploadEntity({ file_path: opts.filePath, name: opts.name });
      printResult(out, mergedOpts(cmd));
    });

  dam
    .command("list")
    .description("列出资源")
    .option("--name <name>", "按名称筛选")
    .option("--page <n>", "页码")
    .option("--per-page <n>", "每页条数")
    .option("--type <type>", "资源类型")
    .option("--deleted <bool>", "是否已删除")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.dam.listEntities({
        name: opts.name,
        page: num(opts.page),
        per_page: num(opts.perPage),
        type: opts.type,
        deleted: bool(opts.deleted),
      });
      printResult(out, mergedOpts(cmd));
    });

  dam
    .command("get <id>")
    .description("获取资源详情")
    .option("--include-signed-id", "包含 signed_id")
    .option("--purpose <p>", "signed_id 用途")
    .action(async (id, opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.dam.getEntity({
        id,
        include_signed_id: opts.includeSignedId,
        purpose: opts.purpose,
      });
      printResult(out, mergedOpts(cmd));
    });

  dam
    .command("delete <id>")
    .description("删除资源")
    .action(async (id, _opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.dam.deleteEntity({ id });
      printResult(out, mergedOpts(cmd));
    });

  dam
    .command("update <id>")
    .description("更新文件元数据")
    .option("--name <name>", "新名称")
    .option("--description <text>", "描述")
    .action(async (id, opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.dam.updateEntity({ id, name: opts.name, description: opts.description });
      printResult(out, mergedOpts(cmd));
    });

  dam
    .command("entity-url")
    .description("生成带过期时间的资源 URL")
    .requiredOption("--entity-id <id>", "实体 ID")
    .option("--purpose <p>", "用途")
    .option("--expires-in <sec>", "过期秒数")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.dam.createEntityUrl({
        entity_id: opts.entityId,
        purpose: opts.purpose,
        expires_in: num(opts.expiresIn),
      });
      printResult(out, mergedOpts(cmd));
    });

  dam
    .command("fragment-create")
    .description("创建知识片段")
    .requiredOption("--name <name>", "名称")
    .requiredOption("--body <text>", "正文（BKE Markdown）")
    .option("--description <text>", "描述")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.dam.createFragment({
        name: opts.name,
        body: opts.body,
        description: opts.description,
      });
      printResult(out, mergedOpts(cmd));
    });

  dam
    .command("fragment-update")
    .description("更新知识片段")
    .requiredOption("--entity-id <id>", "片段实体 ID")
    .option("--name <name>", "名称")
    .option("--body <text>", "正文")
    .option("--description <text>", "描述")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.dam.updateFragment({
        entity_id: opts.entityId,
        name: opts.name,
        body: opts.body,
        description: opts.description,
      });
      printResult(out, mergedOpts(cmd));
    });

  dam
    .command("link-create")
    .description("创建链接资源")
    .requiredOption("--url <url>", "目标 URL")
    .option("--name <name>", "显示名")
    .option("--description <text>", "描述")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.dam.createLink({
        url: opts.url,
        name: opts.name,
        description: opts.description,
      });
      printResult(out, mergedOpts(cmd));
    });

  dam
    .command("link-update")
    .description("更新链接资源")
    .requiredOption("--entity-id <id>", "实体 ID")
    .option("--url <url>", "URL")
    .option("--name <name>", "显示名")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.dam.updateLink({
        entity_id: opts.entityId,
        url: opts.url,
        name: opts.name,
      });
      printResult(out, mergedOpts(cmd));
    });

  dam
    .command("collections")
    .description("列出合集")
    .option("--name-eq <name>", "名称精确匹配（q[name_eq]）")
    .option("--name-cont <name>", "名称包含（q[name_cont]）")
    .option("--parent-id <id>", "父合集 ID（q[parent_id_eq]）")
    .option("--page <n>", "页码")
    .option("--per-page <n>", "每页条数")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.dam.listCollections({
        name_eq: opts.nameEq,
        name_cont: opts.nameCont,
        parent_id_eq: opts.parentId != null ? num(opts.parentId) : undefined,
        page: num(opts.page),
        per_page: num(opts.perPage),
      });
      printResult(out, mergedOpts(cmd));
    });

  dam
    .command("collection-limits")
    .description("合集存储限额")
    .action(async (_opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.dam.getCollectionLimits();
      printResult(out, mergedOpts(cmd));
    });

  return dam;
}
