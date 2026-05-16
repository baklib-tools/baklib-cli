import path from "node:path";
import { runNpxSkillsAdd } from "./run-npx-skills.js";
import { THEME_DEV_SKILL_ID, THEME_DEV_SKILL_NPX_SOURCE } from "./skill-catalog.js";

/**
 * @param {{ cwd?: string, global?: boolean, agent?: string, copy?: boolean }} rawOpts
 */
export function normalizeThemeDevSkillOpts(rawOpts) {
  /** @type {{ cwd: string, global: boolean, copy: boolean, agent?: string }} */
  const out = {
    cwd: path.resolve(String(rawOpts.cwd || process.cwd())),
    global: Boolean(rawOpts.global),
    copy: Boolean(rawOpts.copy),
  };
  const a = rawOpts.agent;
  if (a !== undefined && String(a).trim() !== "") {
    out.agent = String(a).trim();
  }
  return out;
}

/**
 * 安装公开技能 baklib-theme-dev（由 `npx skills add` 拉取）。
 * @param {ReturnType<typeof normalizeThemeDevSkillOpts>} base
 */
export async function installBaklibThemeDevSkill(base) {
  const skillId = THEME_DEV_SKILL_ID;
  const repo = THEME_DEV_SKILL_NPX_SOURCE;
  await runNpxSkillsAdd(repo, { ...base, fullDepth: false, skill: skillId });
  console.log(`✅ 已安装 ${skillId}`);
}
