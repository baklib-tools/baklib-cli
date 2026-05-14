/**
 * Baklib Open API HTTP 客户端（无模块顶层副作用）
 */

function traceEnabled() {
  const v = (process.env.BAKLIB_CLI_TRACE || process.env.BAKLIB_MCP_TRACE || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function traceLog(label, payload) {
  if (!traceEnabled()) return;
  const max = Number(process.env.BAKLIB_CLI_TRACE_MAX_CHARS || 12000);
  const s = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  const out = s.length > max ? `${s.slice(0, max)}\n… (${s.length} chars, truncated)` : s;
  console.error(`[baklib-cli trace] ${label}\n${out}`);
}

export class BaklibClient {
  /**
   * @param {{ token: string, apiBase: string }} opts
   */
  constructor(opts) {
    this.token = opts.token;
    this.apiBase = String(opts.apiBase || "").replace(/\/$/, "");
  }

  /**
   * @param {string} endpoint
   * @param {string} [method]
   * @param {{ body?: object, formData?: import('form-data').default, query?: Record<string, unknown> }} [options]
   */
  async request(endpoint, method = "GET", options = {}) {
    const url = new URL(`${this.apiBase}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`);

    if (options.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers = {
      Authorization: this.token,
    };

    let body = null;
    if (options.formData) {
      Object.assign(headers, options.formData.getHeaders());
      body = options.formData;
    } else if (options.body) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    if (traceEnabled()) {
      console.error(`[baklib-cli] ${method} ${url.toString()}`);
    }
    traceLog("HTTP request body", body || "(none)");

    const response = await fetch(url.toString(), {
      method,
      headers,
      body,
    });

    const responseText = await response.text();

    if (!response.ok) {
      traceLog(`HTTP error ${response.status} body`, responseText);
      throw new Error(`Baklib API error (${response.status}): ${responseText}`);
    }

    if (response.status === 204 || response.headers.get("content-length") === "0") {
      traceLog("HTTP response", "(empty)");
      return { success: true };
    }

    traceLog(`HTTP ${response.status} response body`, responseText || "(empty)");

    const trimmed = responseText.trim();
    if (!trimmed) {
      return {};
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(`Baklib API returned non-JSON (${response.status}): ${responseText.slice(0, 500)}`);
    }
  }
}
