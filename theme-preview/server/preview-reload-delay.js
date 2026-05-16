import { DEFAULT_PREVIEW_RELOAD_DELAY_MS } from "../../src/lib/theme-preview-constants.js";

/**
 * 解析预览热更新延迟（毫秒）。
 * 优先 `BAKLIB_PREVIEW_RELOAD_DELAY_MS`，其次 `BAKLIB_PREVIEW_RELOAD_DELAY`（秒）。
 */
export function resolvePreviewReloadDelayMs() {
  const rawMs = process.env.BAKLIB_PREVIEW_RELOAD_DELAY_MS;
  if (rawMs != null && String(rawMs).trim() !== "") {
    const n = Number(rawMs);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  const rawSec = process.env.BAKLIB_PREVIEW_RELOAD_DELAY;
  if (rawSec != null && String(rawSec).trim() !== "") {
    const s = Number(rawSec);
    if (Number.isFinite(s) && s >= 0) return Math.round(s * 1000);
  }
  return DEFAULT_PREVIEW_RELOAD_DELAY_MS;
}
