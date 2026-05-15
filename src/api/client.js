/**
 * 从错误响应体中提取简短说明（JSON 或纯文本）
 * @param {string} text
 */
function parseErrorBodySnippet(text) {
  const raw = text.trim();
  if (!raw) return "";
  try {
    const j = JSON.parse(raw);
    if (j == null || typeof j !== "object") return "";
    if (typeof j.error === "string" && j.error) return j.error;
    if (Array.isArray(j.errors) && j.errors[0] && typeof j.errors[0].detail === "string") {
      return j.errors[0].detail;
    }
    if (typeof j.message === "string" && j.message) return j.message;
  } catch {
    return raw.length > 280 ? `${raw.slice(0, 280)}…` : raw;
  }
  return "";
}

/**
 * @param {number} status
 * @param {string} responseText
 */
function friendlyHttpErrorMessage(status, responseText) {
  const snippet = parseErrorBodySnippet(responseText);
  const tail = snippet ? `\n服务端说明：${snippet}` : "";

  switch (status) {
    case 401:
      return `鉴权失败（401）：Open API 未接受当前 Token。请用「baklib config set-token <密钥>」或环境变量 BAKLIB_TOKEN 配置有效密钥，并用「baklib config show」核对请求基址是否指向正确的 /api/v1。${tail}`;
    case 403:
      return `禁止访问（403）：当前账号无权执行此操作，或组织 API 调用次数已用尽。${tail}`;
    case 404:
      return `未找到（404）：请求的资源不存在。${tail}`;
    case 422:
      return `请求被拒绝（422）：参数不符合要求。${tail}`;
    case 429:
      return `请求过于频繁（429），请稍后再试。${tail}`;
    default:
      if (status >= 500 && status < 600) {
        return `Baklib 服务端错误（${status}），请稍后重试或联系管理员。${tail}`;
      }
      return `请求失败（HTTP ${status}）${tail || (responseText.trim() ? `\n${responseText.trim().slice(0, 500)}` : "")}`;
  }
}

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
   * @param {{ body?: object, formData?: import('form-data').default, query?: Record<string, unknown>, acceptStatuses?: number[] }} [options]
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
    const acceptStatuses = options.acceptStatuses;
    const okOrAccepted = response.ok || (Array.isArray(acceptStatuses) && acceptStatuses.includes(response.status));

    if (!okOrAccepted) {
      traceLog(`HTTP error ${response.status} body`, responseText);
      throw new Error(friendlyHttpErrorMessage(response.status, responseText));
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
      const out = JSON.parse(trimmed);
      if (Array.isArray(acceptStatuses) && acceptStatuses.length) {
        out._httpStatus = response.status;
      }
      return out;
    } catch {
      throw new Error(`Baklib API returned non-JSON (${response.status}): ${responseText.slice(0, 500)}`);
    }
  }

  /**
   * 下载二进制响应（不落盘），用于主题单文件等。
   * @param {string} endpoint
   * @param {string} [method]
   * @param {{ query?: Record<string, unknown> }} [options]
   * @returns {Promise<Buffer>}
   */
  async requestBuffer(endpoint, method = "GET", options = {}) {
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

    if (traceEnabled()) {
      console.error(`[baklib-cli] ${method} ${url.toString()} (binary)`);
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
    });

    if (!response.ok) {
      const responseText = await response.text();
      traceLog(`HTTP error ${response.status} body`, responseText);
      throw new Error(friendlyHttpErrorMessage(response.status, responseText));
    }

    const ab = await response.arrayBuffer();
    return Buffer.from(ab);
  }
}
