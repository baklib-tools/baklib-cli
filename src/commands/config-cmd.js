import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { loadBaklibConfig, requireToken, DEFAULT_API_BASE } from "../config.js";
import { mergedOpts, printResult } from "../lib/cli-output.js";

export function configCommand() {
  const c = new Command("config").description("查看或写入本地配置");

  c.command("show")
    .description("显示当前解析到的 API 基址与 Token 来源（不回显完整 Token）")
    .action(async (_opts, cmd) => {
      const cfg = await loadBaklibConfig();
      const o = mergedOpts(cmd);
      if (o.apiBase) cfg.apiBase = String(o.apiBase).replace(/\/$/, "");
      printResult(
        {
          apiBase: cfg.apiBase,
          tokenConfigured: Boolean(cfg.token),
          tokenPreview: cfg.token ? `${cfg.token.slice(0, 6)}…(${cfg.token.length} chars)` : null,
          defaultApiBase: DEFAULT_API_BASE,
        },
        mergedOpts(cmd),
      );
    });

  c.command("set-token")
    .description("将 Token 写入 ~/.config/BAKLIB_MCP_TOKEN")
    .argument("<token>", "API Token")
    .action(async (token, _opts, cmd) => {
      const dir = path.join(os.homedir(), ".config");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "BAKLIB_MCP_TOKEN"), token.trim(), "utf8");
      printResult({ ok: true, path: path.join(dir, "BAKLIB_MCP_TOKEN") }, mergedOpts(cmd));
    });

  c.command("set-api-base")
    .description("将 API 基址写入 ~/.config/BAKLIB_MCP_API_BASE")
    .argument("<url>", "例如 https://open.baklib.com/api/v1")
    .action(async (url, _opts, cmd) => {
      const dir = path.join(os.homedir(), ".config");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "BAKLIB_MCP_API_BASE"), url.trim().replace(/\/$/, ""), "utf8");
      printResult({ ok: true, path: path.join(dir, "BAKLIB_MCP_API_BASE") }, mergedOpts(cmd));
    });

  return c;
}
