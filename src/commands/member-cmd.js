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

export function memberCommand() {
  const m = new Command("member").description("当前组织的成员");

  m.command("list")
    .description("分页列出组织成员")
    .option("--page <n>", CLI_HELP_PAGE)
    .option("--per-page <n>", CLI_HELP_PER_PAGE)
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.member.listMembers({ page: num(opts.page), per_page: num(opts.perPage) });
      printResult(out, mergedOpts(cmd));
    });

  m.command("get <id>")
    .description("按成员 ID 获取详情")
    .action(async (id, _opts, cmd) => {
    const api = await getApi(cmd);
    const out = await api.member.getMember({ member_id: id });
    printResult(out, mergedOpts(cmd));
  });

  return m;
}
