import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** `baklib skill install` 所用技能 id（与 baklib-tools/skills 仓库中 `skills/` 下目录名一致） */
export const THEME_DEV_SKILL_ID = "baklib-theme-dev";

/** `npx skills add` 的 GitHub 源：`baklib-tools/skills`（技能本体见 main 分支 `skills/baklib-theme-dev/`） */
export const THEME_DEV_SKILL_NPX_SOURCE = "baklib-tools/skills";

/**
 * npm 包根（含 `package.json`、`.agents/skills/` 等）。自 `src/lib` 或 `dist` 等路径向上解析。
 */
export function getCliPackageRoot() {
  let d = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const pj = path.join(d, "package.json");
    if (fs.existsSync(pj)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pj, "utf8"));
        if (pkg && (pkg.name === "@baklib/baklib-cli" || pkg.name === "baklib-cli")) return d;
      } catch {
        /* 继续向上 */
      }
    }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  const dir = path.dirname(fileURLToPath(import.meta.url));
  if (path.basename(dir) === "dist") return path.join(dir, "..");
  if (path.basename(dir) === "lib") return path.join(dir, "..", "..", "..");
  return path.join(dir, "..", "..");
}
