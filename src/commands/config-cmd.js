import { Command } from "commander";
import {
  loadBaklibConfig,
  requireToken,
  DEFAULT_API_HOST,
  resolveOpenApiBaseUrl,
  openApiHostFromResolvedBase,
  mergeWriteUserBaklibJson,
  mergeWriteProjectBaklibJson,
  getUserBaklibJsonPath,
  findNearestBaklibJsonPath,
  resetGlobalBaklibJson,
  resetProjectBaklibJson,
} from "../config.js";
import { mergedOpts, printResult } from "../lib/cli-output.js";

export function configCommand() {
  const c = new Command("config").description("查看或写入本地配置");

  c.command("show")
    .description("显示当前 Open API 主机、解析后的请求基址（…/api/v1）与 Token 状态（不回显完整 Token）")
    .action(async (_opts, cmd) => {
      const cfg = await loadBaklibConfig();
      const o = mergedOpts(cmd);
      if (o.apiBase) cfg.apiBase = resolveOpenApiBaseUrl(String(o.apiBase));
      const projectJson = await findNearestBaklibJsonPath();
      printResult(
        {
          apiHost: openApiHostFromResolvedBase(cfg.apiBase),
          apiBase: cfg.apiBase,
          tokenConfigured: Boolean(cfg.token),
          tokenPreview: cfg.token ? `${cfg.token.slice(0, 6)}…(${cfg.token.length} chars)` : null,
          defaultApiHost: DEFAULT_API_HOST,
          userBaklibJson: getUserBaklibJsonPath(),
          projectBaklibJson: projectJson,
        },
        mergedOpts(cmd),
      );
    });

  c.command("set-token")
    .description("将 Token 合并写入 baklib.json（默认项目级，-g 为用户级）")
    .option("-g, --global", "写入 ~/.config/baklib/baklib.json")
    .argument("<token>", "API Token")
    .action(async (token, opts, cmd) => {
      const pathWritten = opts.global
        ? await mergeWriteUserBaklibJson({ token: token.trim() })
        : await mergeWriteProjectBaklibJson({ token: token.trim() });
      printResult({ ok: true, path: pathWritten, global: Boolean(opts.global) }, mergedOpts(cmd));
    });

  c.command("set-api-base")
    .description("将 Open API 主机根合并写入 baklib.json（默认项目级，-g 为用户级；不含 /api/v1）")
    .option("-g, --global", "写入 ~/.config/baklib/baklib.json")
    .argument(
      "<url>",
      `Open API 主机根，如 ${DEFAULT_API_HOST}；路径 /api/v1 由 CLI 固定追加。自建填 https://<你的域名>`,
    )
    .action(async (url, opts, cmd) => {
      const host = openApiHostFromResolvedBase(resolveOpenApiBaseUrl(url));
      const pathWritten = opts.global
        ? await mergeWriteUserBaklibJson({ apiHost: host })
        : await mergeWriteProjectBaklibJson({ apiHost: host });
      printResult({ ok: true, path: pathWritten, global: Boolean(opts.global) }, mergedOpts(cmd));
    });

  c.command("reset")
    .description("从 baklib.json 移除 token、apiHost 等凭据字段（无剩余键则删除文件）")
    .option("-g, --global", "仅处理用户级 ~/.config/baklib/baklib.json")
    .action(async (opts, cmd) => {
      if (opts.global) {
        const r = await resetGlobalBaklibJson();
        printResult({ ok: true, scope: "global", ...r }, mergedOpts(cmd));
        return;
      }
      const r = await resetProjectBaklibJson();
      printResult(r, mergedOpts(cmd));
    });

  return c;
}
