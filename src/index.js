import { Command } from "commander";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { damCommand } from "./commands/dam-cmd.js";
import { kbCommand } from "./commands/kb-cmd.js";
import { siteCommand } from "./commands/site-cmd.js";
import { themeCommand } from "./commands/theme-cmd.js";
import { memberCommand } from "./commands/member-cmd.js";
import { userCommand } from "./commands/user-cmd.js";
import { configCommand } from "./commands/config-cmd.js";
import { getHelpBanner } from "./banner.js";
import { runCliStartupHooks } from "./startup.js";
import { DEFAULT_API_HOST } from "../theme-preview/server/open-api-defaults.js";

/** @param {unknown} err */
function reportCliFatal(err) {
  const msg =
    err != null &&
    typeof err === "object" &&
    "message" in err &&
    typeof /** @type {{ message?: unknown }} */ (err).message === "string"
      ? String(/** @type {{ message: string }} */ (err).message)
      : String(err);
  console.error(msg);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

const program = new Command();

program
  .name("baklib")
  .description("Baklib Open API CLI — 数据录入、站点与资源管理、主题本地预览")
  .version(pkg.version)
  .option(
    "-B, --api-base <url>",
    `覆盖 Open API 主机根（否则 BAKLIB_API_BASE / 配置文件；默认 ${DEFAULT_API_HOST}；请求路径固定为 /api/v1）`,
  )
  .option("--json", "以 JSON 输出完整 API 结构（默认输出面向阅读的简要文本）", false);

program.addHelpText("before", () => {
  const banner = getHelpBanner();
  const versionLine = `baklib-cli ${pkg.version}`;
  if (!banner) {
    return `\n${versionLine}\n`;
  }
  return `${banner}\n${versionLine}\n`;
});

// Commander 在「有子命令但未给出子命令」时以 help({ error: true }) 展示帮助并 exit 1；
// 无参裸调 baklib 视为成功（exit 0），同时保留其它错误的退出码。
program.exitOverride((err) => {
  if (err.code === "commander.executeSubCommandAsync") {
    process.exit(err.exitCode ?? 1);
    return;
  }
  if (err.code === "commander.help" && err.exitCode === 1) {
    process.exit(0);
    return;
  }
  process.exit(err.exitCode ?? 1);
});

program.addCommand(damCommand());
program.addCommand(kbCommand());
program.addCommand(siteCommand());
program.addCommand(themeCommand());
program.addCommand(memberCommand());
program.addCommand(userCommand());
program.addCommand(configCommand());

program.on("--help", () => {
  console.log("\n环境变量:");
  console.log("  BAKLIB_TOKEN — API Token");
  console.log(
    `  BAKLIB_API_BASE — Open API 主机根；默认 ${DEFAULT_API_HOST}（实际请求 ${DEFAULT_API_HOST}/api/v1）`,
  );
  console.log("\n配置文件（就近 .baklib/baklib.json 覆盖 ~/.config/baklib/baklib.json；环境变量最后覆盖）:");
  console.log("  ~/.config/baklib/baklib.json — 用户级 JSON，字段 token、apiHost（主机根）");
  console.log(
    `  <项目>/.baklib/baklib.json — 同上，自当前目录向上递归查找；apiHost 示例 ${DEFAULT_API_HOST}（/api/v1 由 CLI 追加）`,
  );
  console.log("\n示例:");
  console.log("  baklib config set-token <token>          # 写入项目 .baklib/baklib.json（无则放在当前目录下）");
  console.log("  baklib config set-token <token> -g       # 写入 ~/.config/baklib/baklib.json");
  console.log("  baklib config set-api-base <host>        # 项目级 apiHost");
  console.log("  baklib config set-api-base <host> -g     # 用户级");
  console.log("  baklib config reset                       # 清除项目 baklib.json 中的凭据字段");
  console.log("  baklib config reset -g                    # 清除用户级 baklib.json 中的凭据字段");
  console.log("  baklib --json site list");
  console.log("  baklib theme init cms my_theme");
  console.log("  baklib theme dev --site-id <id> --theme-dir ./themes/cms/my_theme");
  console.log("  baklib kb pull --space-id <sid> --article-id <aid> --out ./a.md");
  console.log("\n其它环境变量:");
  console.log("  BAKLIB_SKIP_VERSION_CHECK=1 — 跳过每日 npm 版本检查与更新提示");
  console.log("  BAKLIB_NO_BANNER=1 — 帮助信息前不显示 ASCII Logo");
});

runCliStartupHooks({ currentVersion: pkg.version });
try {
  await program.parseAsync(process.argv);
} catch (err) {
  reportCliFatal(err);
  process.exit(1);
}
