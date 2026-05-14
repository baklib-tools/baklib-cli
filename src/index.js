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

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

const program = new Command();

program
  .name("baklib")
  .description("Baklib Open API CLI — 数据录入、站点与资源管理、主题本地预览")
  .version(pkg.version)
  .option("-B, --api-base <url>", "覆盖 API 基址（否则 BAKLIB_MCP_API_BASE / ~/.config / 默认 open.baklib.com）")
  .option("--json", "以 JSON 输出", false);

program.addCommand(damCommand());
program.addCommand(kbCommand());
program.addCommand(siteCommand());
program.addCommand(themeCommand());
program.addCommand(memberCommand());
program.addCommand(userCommand());
program.addCommand(configCommand());

program.on("--help", () => {
  console.log("\n环境变量（与 baklib-mcp-server 一致）:");
  console.log("  BAKLIB_MCP_TOKEN / BAKLIB_TOKEN");
  console.log("  BAKLIB_MCP_API_BASE / BAKLIB_API_BASE");
  console.log("  BAKLIB_MCP_WORKSPACE — 其下 .config/ 可放同名配置文件");
  console.log("\n示例:");
  console.log("  baklib config set-token <token>");
  console.log("  baklib --json site list");
  console.log("  baklib theme init cms my_theme");
  console.log("  baklib theme dev --site-id <id> --theme-dir ./themes/cms/my_theme");
  console.log("  baklib kb pull --space-id <sid> --article-id <aid> --out ./a.md");
});

program.parse();
