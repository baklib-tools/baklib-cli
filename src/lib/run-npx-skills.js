import { spawn } from "node:child_process";

/**
 * @param {string} t
 * @returns {string}
 */
function shellQuoteArg(t) {
  const s = String(t);
  if (s === "") return "''";
  if (!/[^\w@%+=:,./-]/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * @param {string} source  如 `baklib-tools/skills`（主题开发技能源）、GitHub URL 或本地包根绝对路径
 * @param {{ global?: boolean, agent?: string, copy?: boolean, fullDepth?: boolean, skill?: string }} opts
 * @returns {string[]}
 */
export function buildNpxSkillsSpawnArgs(source, opts = {}) {
  const { global = false, agent, copy = false, fullDepth = false, skill = "baklib-theme-dev" } = opts;

  const args = ["--yes", "skills", "add", source, "--skill", skill];
  if (global) args.push("-g");
  if (agent != null && String(agent).trim() !== "") {
    args.push("--agent", String(agent).trim());
  }
  if (copy) args.push("--copy");
  if (fullDepth) args.push("--full-depth");
  args.push("-y");
  return args;
}

/**
 * 供调试：与 spawn 使用的一致参数，拼成一行 shell 命令（不含 cwd）。
 * @param {string} source
 * @param {{ global?: boolean, agent?: string, copy?: boolean, fullDepth?: boolean, skill?: string }} opts
 */
export function formatNpxSkillsShellLine(source, opts = {}) {
  const args = buildNpxSkillsSpawnArgs(source, opts);
  return ["npx", ...args].map(shellQuoteArg).join(" ");
}

/**
 * 调用 `npx skills add`（需本机 npx 与网络）。
 * @param {string} source  如 `baklib-tools/skills`（主题开发技能源）、GitHub URL 或本地包根绝对路径
 * @param {{ cwd?: string, global?: boolean, agent?: string, copy?: boolean, fullDepth?: boolean, skill?: string }} opts
 */
export async function runNpxSkillsAdd(source, opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const spawnOpts = {
    global: opts.global,
    agent: opts.agent,
    copy: opts.copy,
    fullDepth: opts.fullDepth,
    skill: opts.skill,
  };

  const line = formatNpxSkillsShellLine(source, spawnOpts);
  console.error(`$ ${line}  @ ${cwd}\n`);
  await new Promise((r) => setImmediate(r));

  const args = buildNpxSkillsSpawnArgs(source, spawnOpts);

  await new Promise((resolve, reject) => {
    const child = spawn("npx", args, {
      cwd,
      stdio: ["ignore", "inherit", "inherit"],
      shell: process.platform === "win32",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const sig = signal ? ` signal=${signal}` : "";
      reject(new Error(`npx skills add 退出码 ${code ?? "?"}${sig}`));
    });
  });
}
