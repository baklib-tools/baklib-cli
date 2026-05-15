import { getDevState } from "./dev-preview-state.js";
import { setPanelSyncOptions } from "./panel-sync-options.js";

/**
 * 将 dev-state 中的预览语言与手动同步路径写入进程内选项与 BAKLIB_PREVIEW_LOCALE。
 * @param {string} devId
 */
export function applyDevStateToPanelEnv(devId) {
  const st = getDevState(devId) || {};
  const loc = typeof st.previewLocale === "string" && st.previewLocale.trim() ? st.previewLocale.trim() : "zh-CN";
  process.env.BAKLIB_PREVIEW_LOCALE = loc;
  const mp = Array.isArray(st.previewSyncManualPaths)
    ? st.previewSyncManualPaths.filter((x) => typeof x === "string" && x.trim())
    : [];
  setPanelSyncOptions({ previewLocale: loc, previewSyncManualPaths: mp.length ? mp : null });
}
