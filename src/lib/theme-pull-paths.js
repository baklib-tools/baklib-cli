import path from "path";

/**
 * 解析 theme pull 的输出目录与 Git 元数据读取目录。
 * - 仅 `--dir`：写入与 Git 读取均在该目录。
 * - 仅 `--out`：写入该目录；Git 读取同目录（常见：拉入空目录或当前即为仓库根）。
 * - `--dir` + `--out`：Git 在 dir（克隆仓库），文件写入 out。
 * - 二者皆无：等同于 cwd。
 *
 * @param {{ dir?: string, out?: string }} opts
 * @param {string} [cwd]
 * @returns {{ outRoot: string, gitRoot: string }}
 */
export function resolveThemePullRoots(opts, cwd = process.cwd()) {
  const dirRaw = opts.dir != null ? String(opts.dir).trim() : "";
  const outRaw = opts.out != null ? String(opts.out).trim() : "";
  const resolvedDir = dirRaw.length > 0 ? path.resolve(cwd, dirRaw) : null;
  const explicitOut = outRaw.length > 0;
  const outRoot = explicitOut ? path.resolve(cwd, outRaw) : path.resolve(resolvedDir ?? cwd);
  const gitRoot = resolvedDir ?? outRoot;
  return { outRoot, gitRoot };
}
