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

export function userCommand() {
  const u = new Command("user").description("用户");

  u.command("list")
    .option("--page <n>")
    .option("--per-page <n>")
    .action(async (opts, cmd) => {
      const api = await getApi(cmd);
      const out = await api.user.listUsers({ page: num(opts.page), per_page: num(opts.perPage) });
      printResult(out, mergedOpts(cmd));
    });

  u.command("me").action(async (_opts, cmd) => {
    const api = await getApi(cmd);
    const out = await api.user.getCurrent();
    printResult(out, mergedOpts(cmd));
  });

  return u;
}
