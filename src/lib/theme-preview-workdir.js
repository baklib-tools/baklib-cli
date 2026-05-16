import { execFile as execFileCallback } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { packageRoot } from "./package-root.js";

const execFile = promisify(execFileCallback);

const IGNORE_NAMES = new Set(["node_modules", "dist", ".DS_Store"]);

const MANIFEST = "baklib-theme-preview-manifest.json";

/**
 * 动态 import 的 `src/api/*` 所依赖的 npm 包须装在工作台根 `versionDir/node_modules`
 *（从 `src/api/…` 向上解析不会经过 `theme-preview/node_modules`）。
 * 版本范围与发布包根 `package.json` 的 `dependencies` 保持一致。
 */
const WORKSPACE_ROOT_API_PEER_PACKAGES = ["form-data"];

/**
 * @param {string} versionDir
 */
async function hasWorkspaceRootNodeModules(versionDir) {
  try {
    for (const name of WORKSPACE_ROOT_API_PEER_PACKAGES) {
      await fs.access(path.join(versionDir, "node_modules", name, "package.json"));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} versionDir
 * @param {Record<string, unknown>} rootPkg
 */
async function writeWorkspaceRootPackageJson(versionDir, rootPkg) {
  const rootDeps = rootPkg && typeof rootPkg.dependencies === "object" && rootPkg.dependencies !== null
    ? /** @type {Record<string, unknown>} */ (rootPkg.dependencies)
    : {};
  /** @type {Record<string, string>} */
  const deps = {};
  for (const name of WORKSPACE_ROOT_API_PEER_PACKAGES) {
    const v = rootDeps[name];
    if (typeof v !== "string" || !v.trim()) {
      throw new Error(`包根 package.json 须声明 dependencies["${name}"]（供 theme dev 缓存工作台安装）`);
    }
    deps[name] = v.trim();
  }
  const stub = {
    name: "baklib-theme-preview-workspace",
    private: true,
    version: "0.0.0",
    type: "module",
    description: "CLI theme dev cache: hoisted deps for dynamically imported src/api",
    dependencies: deps,
  };
  await fs.writeFile(path.join(versionDir, "package.json"), JSON.stringify(stub, null, 2), "utf8");
}

/** @returns {string} */
export function getThemePreviewCacheBaseDir() {
  const xdg = process.env.XDG_CACHE_HOME?.trim();
  if (xdg && path.isAbsolute(xdg)) return path.join(xdg, "baklib-cli");
  return path.join(os.homedir(), ".cache", "baklib-cli");
}

/** @param {string} version */
export function safeVersionDirSegment(version) {
  const v = String(version || "unknown").trim() || "unknown";
  return v.replace(/[^a-zA-Z0-9._+-]/g, "_");
}

/**
 * @param {string} absRoot
 * @param {string} label
 * @param {string} [rel]
 * @returns {Promise<string[]>}
 */
async function walkFingerprintLines(absRoot, label, rel = "") {
  /** @type {string[]} */
  const lines = [];
  const abs = path.join(absRoot, rel);
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return lines;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (IGNORE_NAMES.has(e.name)) continue;
    const sub = rel ? `${rel}/${e.name}` : e.name;
    const full = path.join(absRoot, sub);
    if (e.isDirectory()) {
      lines.push(...(await walkFingerprintLines(absRoot, label, sub)));
    } else if (e.isFile()) {
      const st = await fs.stat(full);
      lines.push(`${label}/${sub}\t${st.size}\t${st.mtimeMs}\n`);
    }
  }
  return lines;
}

/**
 * 用于判断「包内 theme-preview + 解析用源码」是否变化，需重建缓存工作台。
 * @param {string} pkgRoot
 */
export async function themePreviewWorkspaceFingerprint(pkgRoot) {
  const roots = [
    [path.join(pkgRoot, "theme-preview"), "theme-preview"],
    [path.join(pkgRoot, "src", "lib"), "src/lib"],
    [path.join(pkgRoot, "src", "api"), "src/api"],
  ];
  const chunks = [];
  for (const [abs, label] of roots) {
    chunks.push(...(await walkFingerprintLines(abs, label, "")));
  }
  chunks.sort();
  return crypto.createHash("sha256").update(chunks.join(""), "utf8").digest("hex");
}

/**
 * @param {string} src
 * @param {string} dest
 */
async function copyTreeFiltered(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (IGNORE_NAMES.has(e.name)) continue;
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) await copyTreeFiltered(from, to);
    else if (e.isFile()) await fs.copyFile(from, to);
  }
}

/**
 * @param {string} themePreviewRoot
 */
async function hasViteInNodeModules(themePreviewRoot) {
  try {
    await fs.access(path.join(themePreviewRoot, "node_modules", "vite", "package.json"));
    return true;
  } catch {
    return false;
  }
}

/**
 * 将包内 theme-preview 与 `src/lib`、`src/api` 同步到用户缓存目录并安装依赖，供 Vite 在非 node_modules 包内路径下启动。
 *
 * @param {{ packageRootOverride?: string, quiet?: boolean, recopyPreview?: boolean }} [options]
 * @returns {Promise<{ workspaceRoot: string, themePreviewRoot: string }>}
 */
export async function ensureThemePreviewWorkspace(options = {}) {
  const pkgRoot = options.packageRootOverride ?? packageRoot();
  const quiet = Boolean(options.quiet);
  const recopyPreview = Boolean(options.recopyPreview);

  const pkgJsonPath = path.join(pkgRoot, "package.json");
  const pkg = JSON.parse(await fs.readFile(pkgJsonPath, "utf8"));
  const packageVersion = typeof pkg.version === "string" ? pkg.version : "0.0.0";
  const fp = await themePreviewWorkspaceFingerprint(pkgRoot);

  const cacheBase = getThemePreviewCacheBaseDir();
  const versionDir = path.join(cacheBase, safeVersionDirSegment(packageVersion));
  const themePreviewRoot = path.join(versionDir, "theme-preview");
  const manifestPath = path.join(versionDir, MANIFEST);

  let needCopy = true;
  let needNpm = true;
  if (!recopyPreview) {
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const m = JSON.parse(raw);
      if (m.packageVersion === packageVersion && m.layoutFingerprint === fp) {
        needCopy = false;
        const viteOk = await hasViteInNodeModules(themePreviewRoot);
        const rootOk = await hasWorkspaceRootNodeModules(versionDir);
        needNpm = !viteOk || !rootOk;
      }
    } catch {
      /* cold cache or corrupt manifest */
    }
  } else if (!quiet) {
    console.error("[theme-preview] 已指定 --recopy-preview：将删除缓存工作台并从包内重新复制后安装依赖…");
  }

  if (needCopy) {
    if (!quiet) {
      console.error(
        "[theme-preview] 正在准备本地工作台（复制到缓存并安装依赖，首次或升级后可能较慢）…",
      );
    }
    await fs.rm(versionDir, { recursive: true, force: true });
    await fs.mkdir(versionDir, { recursive: true });
    await copyTreeFiltered(path.join(pkgRoot, "theme-preview"), themePreviewRoot);
    await copyTreeFiltered(path.join(pkgRoot, "src", "lib"), path.join(versionDir, "src", "lib"));
    await copyTreeFiltered(path.join(pkgRoot, "src", "api"), path.join(versionDir, "src", "api"));
    await fs.writeFile(
      manifestPath,
      JSON.stringify({ packageVersion, layoutFingerprint: fp }, null, 2),
      "utf8",
    );
    await writeWorkspaceRootPackageJson(versionDir, pkg);
    needNpm = true;
  }

  if (needNpm) {
    await writeWorkspaceRootPackageJson(versionDir, pkg);
    if (!quiet && !needCopy) {
      console.error("[theme-preview] 检测到依赖缺失，正在执行 npm install…");
    }
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    try {
      await execFile(npmCmd, ["install", "--no-fund", "--no-audit"], {
        cwd: themePreviewRoot,
        stdio: quiet ? "pipe" : "inherit",
      });
      await execFile(npmCmd, ["install", "--no-fund", "--no-audit"], {
        cwd: versionDir,
        stdio: quiet ? "pipe" : "inherit",
      });
    } catch (e) {
      const stderr =
        e && typeof e === "object" && "stderr" in e && Buffer.isBuffer(/** @type {{ stderr?: Buffer }} */ (e).stderr)
          ? String(/** @type {{ stderr: Buffer }} */ (e).stderr)
          : "";
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`theme-preview 工作台 npm install 失败：${stderr || msg}`);
    }
  }

  return { workspaceRoot: versionDir, themePreviewRoot };
}
