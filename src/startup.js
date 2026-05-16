import { fetchNpmLatestVersion, NPM_PUBLISHED_NAME } from "./lib/npmLatestVersion.js";
import { loadUpdateState, patchUpdateState } from "./lib/cliUpdateState.js";
import { semverGt } from "./lib/semverGt.js";
import { localCalendarDay } from "./lib/localCalendarDay.js";

function printPendingUpdateNotice(currentVersion) {
  const st = loadUpdateState();
  const pending = st.pendingNotifyVersion?.trim();
  if (!pending) return;
  if (!semverGt(pending, currentVersion)) {
    patchUpdateState({ pendingNotifyVersion: "" });
    return;
  }
  console.error("");
  console.error(
    `[baklib-cli] 有新版本 ${pending}（当前 ${currentVersion}）。可执行：npm i -g ${NPM_PUBLISHED_NAME}`,
  );
  console.error("");
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
      }
      patchUpdateState(patch);
    })();
  });
}

/**
 * 每次启动 CLI 时调用：若有上次异步检查记录的新版本，则 stderr 提示并清除标记；
 * 若本自然日尚未检查过 registry，则异步拉取 latest（不阻塞当前命令）。
 */
export function runCliStartupHooks({ currentVersion }) {
  if (process.env.BAKLIB_SKIP_VERSION_CHECK === "1") return;
  printPendingUpdateNotice(currentVersion);
  scheduleDailyNpmVersionCheck(currentVersion);
}
