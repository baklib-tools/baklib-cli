import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREVIEW_RELOAD_DELAY_MS } from "../src/lib/theme-preview-constants.js";
import { resolvePreviewReloadDelayMs } from "../theme-preview/server/preview-reload-delay.js";
import { injectPreviewLiveReloadScript } from "../theme-preview/server/preview-live-reload.js";

test("DEFAULT_PREVIEW_RELOAD_DELAY_MS is 1000", () => {
  assert.equal(DEFAULT_PREVIEW_RELOAD_DELAY_MS, 1000);
});

test("resolvePreviewReloadDelayMs reads BAKLIB_PREVIEW_RELOAD_DELAY_MS", () => {
  const prevMs = process.env.BAKLIB_PREVIEW_RELOAD_DELAY_MS;
  const prevSec = process.env.BAKLIB_PREVIEW_RELOAD_DELAY;
  delete process.env.BAKLIB_PREVIEW_RELOAD_DELAY;
  process.env.BAKLIB_PREVIEW_RELOAD_DELAY_MS = "2500";
  try {
    assert.equal(resolvePreviewReloadDelayMs(), 2500);
  } finally {
    if (prevMs === undefined) delete process.env.BAKLIB_PREVIEW_RELOAD_DELAY_MS;
    else process.env.BAKLIB_PREVIEW_RELOAD_DELAY_MS = prevMs;
    if (prevSec === undefined) delete process.env.BAKLIB_PREVIEW_RELOAD_DELAY;
    else process.env.BAKLIB_PREVIEW_RELOAD_DELAY = prevSec;
  }
});

test("resolvePreviewReloadDelayMs reads BAKLIB_PREVIEW_RELOAD_DELAY seconds", () => {
  const prevMs = process.env.BAKLIB_PREVIEW_RELOAD_DELAY_MS;
  const prevSec = process.env.BAKLIB_PREVIEW_RELOAD_DELAY;
  delete process.env.BAKLIB_PREVIEW_RELOAD_DELAY_MS;
  process.env.BAKLIB_PREVIEW_RELOAD_DELAY = "1.5";
  try {
    assert.equal(resolvePreviewReloadDelayMs(), 1500);
  } finally {
    if (prevMs === undefined) delete process.env.BAKLIB_PREVIEW_RELOAD_DELAY_MS;
    else process.env.BAKLIB_PREVIEW_RELOAD_DELAY_MS = prevMs;
    if (prevSec === undefined) delete process.env.BAKLIB_PREVIEW_RELOAD_DELAY;
    else process.env.BAKLIB_PREVIEW_RELOAD_DELAY = prevSec;
  }
});

test("injectPreviewLiveReloadScript is idempotent", () => {
  const html = "<html><body></body></html>";
  const once = injectPreviewLiveReloadScript(html);
  assert.equal(injectPreviewLiveReloadScript(once), once);
});
