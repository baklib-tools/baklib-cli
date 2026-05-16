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
import { skillCommand } from "./commands/skill-cmd.js";
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
    "Baklib Open API 命令行：先配置 Token 与 API 主机（见 baklib config --help），再使用 site / kb / dam / theme / skill 等子命令。",
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
  const versionLine = `${pkg.name} ${pkg.version}`;
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
program.addCommand(skillCommand());

(function inheritHelpFromProgram(root) {
  for (const c of root.commands) {
    c.copyInheritedSettings(root);
    inheritHelpFromProgram(c);
  }
})(program);

program.on("--help", () => {
  console.log("");
  console.log("请先用「baklib config」配置 Token 与 Open API 主机，再使用各子命令。");
  console.log("用法与选项见：baklib <命令名> --help（例如 baklib config --help、baklib theme --help、baklib skill --help）。");
});

runCliStartupHooks({ currentVersion: pkg.version });
try {
  await program.parseAsync(process.argv);
} catch (err) {
  reportCliFatal(err);
  process.exit(1);
}
