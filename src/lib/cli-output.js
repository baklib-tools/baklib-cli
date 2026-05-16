import util from "node:util";

/**
 * @param {import('commander').Command} cmd
 */
export function mergedOpts(cmd) {
  if (typeof cmd.optsWithGlobals === "function") {
    return cmd.optsWithGlobals();
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  let cur = cmd;
  while (cur) {
    Object.assign(out, cur.opts());
    cur = cur.parent;
  }
  return out;
}

/** @param {unknown} x */
function isPlainObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/** @param {unknown} x */
function isJsonApiResource(x) {
  return (
    isPlainObject(x) &&
    (typeof x.id === "string" || typeof x.id === "number") &&
    typeof x.type === "string" &&
    isPlainObject(x.attributes)
  );
}

/** @param {unknown} v */
function formatScalar(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    return util.inspect(v, { depth: 2, colors: false, maxArrayLength: 12, breakLength: 120 });
  }
  const s = String(v);
  return s.length > 240 ? `${s.slice(0, 240)}…` : s;
}

/** @param {Record<string, unknown>} meta */
function formatMetaHuman(meta) {
  const total = meta.total_count;
  const pageSize = meta.page_size;
  const nextPage = meta.next_page;
  if (total != null && nextPage == null && pageSize != null && Number(pageSize) >= Number(total)) {
    return `共 ${total} 条`;
  }
  const parts = [];
  if (total != null) parts.push(`共 ${total} 条`);
  if (meta.current_page != null && pageSize != null) {
    parts.push(`第 ${meta.current_page} 页 · 每页 ${pageSize}`);
  }
  return parts.join(" · ");
}

/** @param {Record<string, unknown>} attrs */
function oneLineFromAttributes(attrs) {
  const bits = [];
  if (attrs.scope != null && String(attrs.scope).trim() !== "") {
    bits.push(String(attrs.scope).trim());
  }
  const name = attrs.name ?? attrs.title ?? attrs.display_name;
  if (typeof name === "string" && name.trim()) bits.push(name.trim().replace(/\s+/g, " "));
  if (attrs.slug != null && attrs.slug !== "") bits.push(`slug: ${attrs.slug}`);
  if (attrs.articles_count != null) bits.push(`${attrs.articles_count} 篇`);
  if (attrs.pages_count != null) bits.push(`${attrs.pages_count} 页`);
  if (attrs.updated_at) bits.push(`更新 ${String(attrs.updated_at).slice(0, 19).replace("T", " ")}`);
  return bits.join("  ·  ");
}

/** @param {string} t */
function omitJsonApiTypeInHumanList(t) {
  const n = (t || "").toLowerCase();
  return n === "theme" || n === "themes";
}

/**
 * 与 theme list 人类可读行一致（单条；id 至少 3 位宽以便与列表对齐）
 * @param {{ id?: string|number, name?: string, scope?: string, updated_at?: unknown }} t
 */
export function formatThemeSummaryHumanLine(t) {
  const idStr = String(t.id ?? "");
  const idW = Math.max(3, idStr.length);
  const idPadded = idStr.padStart(idW, " ");
  const attrs = {
    scope: t.scope,
    name: t.name,
    updated_at: t.updated_at,
  };
  const tail = oneLineFromAttributes(attrs);
  const head = `[${idPadded}]`;
  return tail ? `  ${head}  ${tail}` : `  ${head}`;
}

/** @param {unknown[]} items */
function formatJsonApiList(items) {
  if (items.length === 0) return "（无数据）\n";
  const resources = items.filter(isJsonApiResource);
  const idWidth = resources.length ? Math.max(...resources.map((r) => String(r.id).length)) : 0;

  const lines = items.map((item) => {
    if (!isJsonApiResource(item)) {
      return `  ${formatScalar(item)}`;
    }
    const tail = oneLineFromAttributes(item.attributes);
    const idPadded = String(item.id).padStart(idWidth, " ");
    const typeStr = String(item.type || "");
    const head = omitJsonApiTypeInHumanList(typeStr) ? `[${idPadded}]` : `[${idPadded}] ${typeStr}`;
    return tail ? `  ${head}  ${tail}` : `  ${head}`;
  });
  return `${lines.join("\n")}\n`;
}

/** @param {unknown} item */
function formatJsonApiSingle(item) {
  if (!isJsonApiResource(item)) {
    return `${util.inspect(item, { depth: 6, colors: false })}\n`;
  }
  const a = item.attributes;
  const lines = [`类型: ${item.type}`, `ID: ${String(item.id)}`];
  for (const [k, v] of Object.entries(a)) {
    if (v === null || v === undefined) continue;
    lines.push(`${k}: ${formatScalar(v).replace(/\n/g, " ")}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * 供人类阅读：去掉 full_response 等冗余项后再排版
 * @param {unknown} data
 */
export function formatHumanResult(data) {
  if (data == null) return "（空）\n";
  if (typeof data === "string") return data.endsWith("\n") ? data : `${data}\n`;
  if (typeof data !== "object") return `${String(data)}\n`;
  if (Array.isArray(data)) {
    return `${util.inspect(data, { depth: 5, colors: false, maxArrayLength: 40 })}\n`;
  }

  /** 配置 / 脚手架类：ok + 少量字段 */
  if ("ok" in data && data.ok === true && !("success" in data)) {
    return `${Object.entries(data)
      .map(([k, v]) => `${k}: ${formatScalar(v)}`)
      .join("\n")}\n`;
  }

  if (isPlainObject(data) && data.success === true) {
    const { full_response: _fr, success: _s, data: d, meta, ...rest } = /** @type {Record<string, unknown>} */ (data);
    const chunks = [];

    if (meta && isPlainObject(meta) && Object.keys(meta).length > 0) {
      const m = formatMetaHuman(meta);
      if (m) chunks.push(m, "");
    }

    if (d !== undefined && d !== null) {
      if (Array.isArray(d)) {
        chunks.push(d.length && isJsonApiResource(d[0]) ? formatJsonApiList(d) : `${util.inspect(d, { depth: 4, colors: false, maxArrayLength: 40 })}\n`);
      } else if (isJsonApiResource(d)) {
        chunks.push(formatJsonApiSingle(d));
      } else if (isPlainObject(d)) {
        chunks.push(`${util.inspect(d, { depth: 6, colors: false, breakLength: 100 })}\n`);
      } else {
        chunks.push(`${formatScalar(d)}\n`);
      }
    } else {
      const rk = Object.keys(rest);
      if (rk.length === 0) {
        chunks.push("完成。\n");
      } else {
        chunks.push(`${rk.map((k) => `${k}: ${formatScalar(rest[k])}`).join("\n")}\n`);
      }
    }
    return chunks.join("\n");
  }

  if (isPlainObject(data) && "tokenConfigured" in data && "userBaklibJson" in data) {
    const o = /** @type {Record<string, unknown>} */ (data);
    const proj = o.projectBaklibJson == null ? "（无）" : String(o.projectBaklibJson);
    return [
      `API 主机: ${o.apiHost}`,
      `Token: ${o.tokenConfigured ? o.tokenPreview : "（未配置）"}`,
      `用户配置: ${o.userBaklibJson}`,
      `项目配置: ${proj}`,
      "",
    ].join("\n");
  }

  return `${util.inspect(data, { depth: 8, colors: false, maxArrayLength: 40, breakLength: 100 })}\n`;
}

/**
 * @param {unknown} data
 * @param {{ json?: boolean }} opts
 */
export function printResult(data, opts) {
  const json = Boolean(opts?.json);
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (typeof data === "string") {
    console.log(data);
    return;
  }
  process.stdout.write(formatHumanResult(data).replace(/\n+$/, "") + "\n");
}
