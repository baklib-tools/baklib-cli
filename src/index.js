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
import { installBaklibCommanderLocale } from "./cli-help-locale.js";

installBaklibCommanderLocale();

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
  .description(
    "Baklib Open API 命令行：本地配置 Token 与 API 主机后，可管理站点 / 知识库 / 资源库 / 成员与用户，并进行主题脚手架与本地预览。",
  )
  .version(pkg.version, "-V, --version", "显示版本号")
  .helpOption("-h, --help", "显示帮助信息")
  .helpCommand("help [command]", "显示子命令帮助")
  .option(
    "-B, --api-base <url>",
    `覆盖 Open API 主机根（未指定时使用配置与环境变量；默认 ${DEFAULT_API_HOST}；实际请求 ${DEFAULT_API_HOST}/api/v1）`,
  )
  .option(
    "--json",
    "输出原始 JSON（便于脚本解析）；省略时输出面向终端阅读的简要摘要",
    false,
  );

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

(function inheritHelpFromProgram(root) {
  for (const c of root.commands) {
    c.copyInheritedSettings(root);
    inheritHelpFromProgram(c);
  }
})(program);

program.on("--help", () => {
  console.log("\n查看某类能力的全部子命令：baklib <命令名> --help");
  console.log("  例如: baklib site --help   baklib kb --help   baklib theme --help");

  console.log("\n鉴权与环境变量:");
  console.log("  BAKLIB_TOKEN — Open API Token（与配置文件 token 二选一即可合并）");
  console.log(
    `  BAKLIB_API_BASE — Open API 主机根；默认 ${DEFAULT_API_HOST}（CLI 会请求 ${DEFAULT_API_HOST}/api/v1）`,
  );

  console.log("\n配置文件（自当前目录向上找 .baklib/baklib.json，再与用户级合并；环境变量始终最后覆盖）:");
  console.log(`  ~/.config/baklib/baklib.json — 用户级；字段 token、apiHost（主机根，勿含 /api/v1）`);
  console.log(`  <项目>/.baklib/baklib.json — 项目级；同上；apiHost 示例 ${DEFAULT_API_HOST}`);

  console.log("\n常用示例 — 配置");
  console.log("  baklib config show");
  console.log("  baklib config set-token <token>              # 默认写入就近项目 .baklib/baklib.json");
  console.log("  baklib config set-token <token> -g           # 写入用户级 ~/.config/baklib/baklib.json");
  console.log(`  baklib config set-api-base ${DEFAULT_API_HOST}`);
  console.log("  baklib config set-api-base <host> -g");
  console.log("  baklib config reset                          # 清除项目级凭据字段");
  console.log("  baklib config reset -g                       # 清除用户级凭据字段");

  console.log("\n常用示例 — 列出站点 / 知识库 / 资源（可加 --json 输出原始 JSON）");
  console.log("  baklib site list");
  console.log("  baklib kb spaces");
  console.log("  baklib dam list");

  console.log("\n常用示例 — 主题开发");
  console.log("  baklib theme init cms my_theme");
  console.log("  baklib theme dev --theme-dir ./themes/cms/my_theme");

  console.log("\n常用示例 — 知识库文章导入导出");
  console.log("  baklib kb pull --space-id <sid> --article-id <aid> --out ./article.md");
  console.log("  baklib kb push --file ./article.md");

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
