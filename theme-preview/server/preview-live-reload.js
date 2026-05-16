import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolvePreviewReloadDelayMs } from "./preview-reload-delay.js";

export const PREVIEW_LIVE_RELOAD_CLIENT_PATH = "/__baklib_live_reload/client.js";
export const PREVIEW_LIVE_RELOAD_MORPHDOM_PATH = "/__baklib_live_reload/morphdom.js";
export const PREVIEW_LIVE_RELOAD_EVENTS_PATH = "/__baklib_live_reload/events";

const PREVIEW_LIVE_RELOAD_SCRIPT_TAG = `<script src="${PREVIEW_LIVE_RELOAD_CLIENT_PATH}" defer></script>`;

/** @type {Set<import("http").ServerResponse>} */
const sseClients = new Set();

/** @type {ReturnType<typeof setInterval> | null} */
let heartbeatTimer = null;

/** @type {string | null} */
let morphdomSourceCache = null;

function ensureHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (sseClients.size === 0) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      return;
    }
    for (const res of sseClients) {
      try {
        res.write(": ping\n\n");
      } catch {
        sseClients.delete(res);
      }
    }
  }, 30_000);
  if (typeof heartbeatTimer.unref === "function") heartbeatTimer.unref();
}

function readMorphdomUmdSource() {
  if (morphdomSourceCache) return morphdomSourceCache;
  const require = createRequire(import.meta.url);
  const file = require.resolve("morphdom/dist/morphdom-umd.js");
  morphdomSourceCache = readFileSync(file, "utf8");
  return morphdomSourceCache;
}

/**
 * 主题已同步到预览会话后调用，通知已打开的预览页在延迟后 morph 更新。
 */
export function notifyPreviewTemplateSynced() {
  if (sseClients.size === 0) return;
  const payload = `event: reload\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

/**
 * @param {string} html
 */
export function injectPreviewLiveReloadScript(html) {
  if (typeof html !== "string" || !html) return html;
  if (html.includes(PREVIEW_LIVE_RELOAD_CLIENT_PATH)) return html;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${PREVIEW_LIVE_RELOAD_SCRIPT_TAG}</body>`);
  }
  return `${html}${PREVIEW_LIVE_RELOAD_SCRIPT_TAG}`;
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {string} urlPath
 * @returns {boolean} 已处理
 */
export function handlePreviewLiveReloadRequest(req, res, urlPath) {
  if (req.method !== "GET") return false;

  if (urlPath === PREVIEW_LIVE_RELOAD_MORPHDOM_PATH) {
    try {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(readMorphdomUmdSource());
    } catch (e) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`morphdom unavailable: ${String(e?.message || e)}`);
    }
    return true;
  }

  if (urlPath === PREVIEW_LIVE_RELOAD_CLIENT_PATH) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(buildLiveReloadClientSource());
    return true;
  }

  if (urlPath === PREVIEW_LIVE_RELOAD_EVENTS_PATH) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    sseClients.add(res);
    ensureHeartbeat();
    req.on("close", () => {
      sseClients.delete(res);
    });
    return true;
  }

  return false;
}

function buildLiveReloadClientSource() {
  const delay = resolvePreviewReloadDelayMs();
  const morphPath = PREVIEW_LIVE_RELOAD_MORPHDOM_PATH;
  const eventsPath = PREVIEW_LIVE_RELOAD_EVENTS_PATH;
  return `(function () {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return;
  var DELAY = ${delay};
  var MORPH = ${JSON.stringify(morphPath)};
  var EVENTS = ${JSON.stringify(eventsPath)};
  var timer = null;

  function captureUiState() {
    var active = document.activeElement;
    var state = {
      sx: window.scrollX,
      sy: window.scrollY,
      activeId: active && active.id ? active.id : "",
      selStart: null,
      selEnd: null,
    };
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
      state.selStart = active.selectionStart;
      state.selEnd = active.selectionEnd;
    }
    return state;
  }

  function restoreUiState(state) {
    window.scrollTo(state.sx, state.sy);
    if (!state.activeId) return;
    var el = document.getElementById(state.activeId);
    if (!el || !el.focus) return;
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      el.focus();
    }
    if (state.selStart != null && state.selEnd != null && typeof el.selectionStart === "number") {
      try {
        el.selectionStart = state.selStart;
        el.selectionEnd = state.selEnd;
      } catch (e2) {}
    }
  }

  function morphRefresh() {
    var ui = captureUiState();
    fetch(window.location.href, {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    })
      .then(function (r) {
        if (!r.ok) throw new Error("status " + r.status);
        return r.text();
      })
      .then(function (html) {
        if (typeof morphdom !== "function") throw new Error("no morphdom");
        var doc = new DOMParser().parseFromString(html, "text/html");
        if (doc.title) document.title = doc.title;
        morphdom(document.body, doc.body, {
          childrenOnly: true,
          onBeforeElUpdated: function (fromEl, toEl) {
            if (
              fromEl === document.activeElement &&
              (fromEl.tagName === "INPUT" ||
                fromEl.tagName === "TEXTAREA" ||
                fromEl.isContentEditable)
            ) {
              return false;
            }
            return true;
          },
        });
        restoreUiState(ui);
      })
      .catch(function () {
        window.location.reload();
      });
  }

  function scheduleRefresh() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      morphRefresh();
    }, DELAY);
  }

  function scheduleHardReload() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      window.location.reload();
    }, DELAY);
  }

  function connectEvents(useMorph) {
    var es = new EventSource(EVENTS);
    es.addEventListener("reload", useMorph ? scheduleRefresh : scheduleHardReload);
    es.onerror = function () {};
  }

  var boot = document.createElement("script");
  boot.src = MORPH;
  boot.onload = function () {
    connectEvents(true);
  };
  boot.onerror = function () {
    connectEvents(false);
  };
  (document.head || document.documentElement).appendChild(boot);
})();`;
}
