/**
 * 开发面板写入的预览同步选项（与 cookie dev-state 同步），供 preview-sync-runtime 读进程内状态。
 */

/** @type {string | null} */
let panelPreviewLocale = null;
/** @type {string[] | null} */
let panelManualPaths = null;

/**
 * @param {{ previewLocale?: string, previewSyncManualPaths?: string[] | null }} opts
 */
export function setPanelSyncOptions(opts) {
  const raw = opts?.previewLocale;
  panelPreviewLocale = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  const mp = Array.isArray(opts?.previewSyncManualPaths)
    ? opts.previewSyncManualPaths.filter((x) => typeof x === "string" && x.trim())
    : null;
  panelManualPaths = mp && mp.length ? mp : null;
}

export function getPanelSyncOptions() {
  return { previewLocale: panelPreviewLocale, manualPaths: panelManualPaths };
}
