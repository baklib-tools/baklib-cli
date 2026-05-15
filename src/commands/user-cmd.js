import { Command } from "commander";
import { loadBaklibConfig, requireToken, resolveOpenApiBaseUrl } from "../config.js";
import { createBaklibApi } from "../api/index.js";
import { mergedOpts, printResult } from "../lib/cli-output.js";
import { CLI_HELP_PAGE, CLI_HELP_PER_PAGE } from "../cli-help-locale.js";

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

export function userCommand() {
  const u = new Command("user").description("当前账户与用户列表");

  u.command("list")
    .description("分页列出用户")
    .option("--page <n>", CLI_HELP_PAGE)
    .option("--per-page <n>", CLI_HELP_PER_PAGE)
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.user.listUsers({ page: num(opts.page), per_page: num(opts.perPage) });
      printResult(out, mergedOpts(cmd));
    });

  u.command("me")
    .description("获取当前登录用户信息")
    .action(async (_opts, cmd) => {
    const api = await getApi(cmd);
    const out = await api.user.getCurrent();
    printResult(out, mergedOpts(cmd));
  });

  return u;
}
