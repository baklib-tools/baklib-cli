import { Command } from "commander";
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

export function memberCommand() {
  const m = new Command("member").description("组织成员");

  m.command("list")
    .option("--page <n>")
    .option("--per-page <n>")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.member.listMembers({ page: num(opts.page), per_page: num(opts.perPage) });
      printResult(out, mergedOpts(cmd));
    });

  m.command("get <id>").action(async (id, _opts, cmd) => {
    const api = await getApi(cmd);
    const out = await api.member.getMember({ member_id: id });
    printResult(out, mergedOpts(cmd));
  });

  return m;
}
