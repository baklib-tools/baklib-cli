/** 访问日志行尾括号内的标记与 vite-plugin-preview.js 中 pushAccessLine 文案保持一致 */

export type PreviewLogFilter = "all" | "system" | "page" | "resource"

const PREVIEW_LOG_LINE_TIME = /^\[(\d{2}:\d{2}:\d{2})\]/

export function parsePreviewLogBracketTime(line: string): string | null {
  const m = PREVIEW_LOG_LINE_TIME.exec(line.trim())
  return m ? m[1] : null
}

/**
 * 将访问日志行分为：页面 HTML 预览、静态资源链路、其余（重定向/回退/错误等归为系统级访问）。
 */
export function classifyAccessLogLine(line: string): Exclude<PreviewLogFilter, "all"> {
  const s = line.trim()
  if (s.includes("preview_render path=")) return "page"
  if (s.includes("(no preview session)")) return "page"
  if (s.includes("(preview: no site)")) return "page"
  if (s.includes("(preview: no session id)")) return "page"
  if (s.includes("(__theme_asset")) return "resource"
  if (s.includes("(portal /-/")) return "resource"
  if (s.includes("(static→vite)")) return "resource"
  return "system"
}

/**
 * 将访问日志与同步日志按行首 `[HH:MM:SS]` 合并为一条时间线（同一时间戳内保持各自原有顺序）。
 */
export function mergePreviewTimeline(access: string[] | undefined, sync: string[] | undefined): string[] {
  const a = Array.isArray(access) ? access : []
  const b = Array.isArray(sync) ? sync : []
  type Entry = { line: string; t: string | null; order: number }
  const entries: Entry[] = []
  let order = 0
  for (const line of a) entries.push({ line, t: parsePreviewLogBracketTime(line), order: order++ })
  for (const line of b) entries.push({ line, t: parsePreviewLogBracketTime(line), order: order++ })
  entries.sort((x, y) => {
    if (x.t == null && y.t == null) return x.order - y.order
    if (x.t == null) return 1
    if (y.t == null) return -1
    const cmp = x.t.localeCompare(y.t)
    return cmp !== 0 ? cmp : x.order - y.order
  })
  return entries.map((e) => e.line)
}

/**
 * 按类型过滤后再按时间线合并。同步/监控日志仅出现在「全部」「系统」。
 */
export function buildPreviewLogTimeline(
  access: string[] | undefined,
  sync: string[] | undefined,
  filter: PreviewLogFilter,
): string[] {
  const a = Array.isArray(access) ? access : []
  const b = Array.isArray(sync) ? sync : []
  let acc = a
  let syn = b
  if (filter === "page") {
    syn = []
    acc = a.filter((line) => classifyAccessLogLine(line) === "page")
  } else if (filter === "resource") {
    syn = []
    acc = a.filter((line) => classifyAccessLogLine(line) === "resource")
  } else if (filter === "system") {
    acc = a.filter((line) => classifyAccessLogLine(line) === "system")
  }
  return mergePreviewTimeline(acc, syn)
}

/** 用于检测是否有新日志（与当前筛选无关，避免轮询重复数据触发误滚） */
export function previewLogDataFingerprint(access: string[] | undefined, sync: string[] | undefined): string {
  return mergePreviewTimeline(access, sync).join("\n")
}
