import { Command } from "commander";
import { installBaklibThemeDevSkill, normalizeThemeDevSkillOpts } from "../lib/theme-dev-skill-install.js";
import { THEME_DEV_SKILL_ID } from "../lib/skill-catalog.js";

export function skillCommand() {
  const skillCmd = new Command("skill")
    .name("skill")
    .description("主题模版开发技能（baklib-theme-dev）");

  skillCmd
    .command("install")
    .description("安装 baklib-theme-dev，便于 AI 辅助编写 Liquid 主题")
    .addHelpText("after", "\n主题脚手架见 `baklib theme init`；技能需单独安装。\n")
    .option("-C, --cwd <path>", "安装目标目录（默认当前目录）")
    .option("-g, --global", "安装到用户级技能目录", false)
    .option("-a, --agent <names>", "目标 Agent（可选）")
    .option("--copy", "复制文件（默认 symlink）", false)
    .action(async (opts, cmd) => {
      const extra = cmd.args ?? [];
      if (extra.length > 0) {
        console.error(
          `错误：不接受额外参数。本命令仅安装「${THEME_DEV_SKILL_ID}」；其它技能请自行使用 npx skills add。`,
        );
        process.exit(1);
      }
      const base = normalizeThemeDevSkillOpts(opts);
      try {
        await installBaklibThemeDevSkill(base);
      } catch (e) {
        console.error(`错误：无法通过 npx skills 安装 ${THEME_DEV_SKILL_ID}。`);
        console.error(e?.message || e);
        process.exit(1);
      }
    });

  return skillCmd;
}
