import { fetchNpmLatestVersion, NPM_PUBLISHED_NAME } from "./lib/npmLatestVersion.js";
import { loadUpdateState, patchUpdateState } from "./lib/cliUpdateState.js";
import { semverGt } from "./lib/semverGt.js";
import { localCalendarDay } from "./lib/localCalendarDay.js";

/**
 * @param {string} currentVersion
 * @param {string} latestVersion
 */
export function formatNewVersionMessage(currentVersion, latestVersion) {
  return `[baklib-cli] 有新版本 ${latestVersion}（当前 ${currentVersion}）。可执行：npm i -g ${NPM_PUBLISHED_NAME}`;
}

/**
 * @param {string} currentVersion
 * @param {string} latestVersion
 */
export function printNewVersionNotice(currentVersion, latestVersion) {
  console.error("");
  console.error(formatNewVersionMessage(currentVersion, latestVersion));
  console.error("");
}

function printPendingUpdateNotice(currentVersion) {
  const st = loadUpdateState();
  const pending = st.pendingNotifyVersion?.trim();
  if (!pending) return;
  if (!semverGt(pending, currentVersion)) {
    patchUpdateState({ pendingNotifyVersion: "" });
    return;
  }
  printNewVersionNotice(currentVersion, pending);
  patchUpdateState({ pendingNotifyVersion: "" });
}

function scheduleDailyNpmVersionCheck(currentVersion) {
  const today = localCalendarDay();
  const st = loadUpdateState();
  if (st.lastCheckDay === today) return;

  setImmediate(() => {
    void (async () => {
      let latest;
      try {
        latest = await fetchNpmLatestVersion();
      } catch {
        patchUpdateState({ lastCheckDay: today });
        return;
      }

      const patch = { lastCheckDay: today };
      if (semverGt(latest, currentVersion)) {
        patch.pendingNotifyVersion = latest;
        patchUpdateState(patch);
        printNewVersionNotice(currentVersion, latest);
        patchUpdateState({ pendingNotifyVersion: "" });
        return;
      }
      patchUpdateState(patch);
    })();
  });
}

/**
 * 是否在启动时跳过 npm 版本检查（环境变量或仅查询版本号）。
 * @param {string[]} [argv] 默认 process.argv
 */
export function shouldSkipVersionCheck(argv = process.argv) {
  if (process.env.BAKLIB_SKIP_VERSION_CHECK === "1") return true;
  const args = argv.slice(2);
  return args.length === 1 && (args[0] === "--version" || args[0] === "-V");
}

/**
 * 每次启动 CLI 时调用：若有上次异步检查记录的新版本，则 stderr 提示并清除标记；
 * 若本自然日尚未检查过 registry，则异步拉取 latest（不阻塞当前命令），发现更新时尽量当次提示。
 */
export function runCliStartupHooks({ currentVersion }) {
  if (shouldSkipVersionCheck()) return;
  printPendingUpdateNotice(currentVersion);
  scheduleDailyNpmVersionCheck(currentVersion);
}
