import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  LayoutTemplate,
  MapPin,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { jsonApiDataArray, jsonApiRowsToRemotePageRows } from "../server/jsonapi-pages.js"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ManualSyncPathTree } from "@/components/manual-sync-path-tree"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectItem,
  SelectLabel,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverPopup } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { appNotify } from "@/lib/app-toast"
import {
  type PreviewLogFilter,
  buildPreviewLogTimeline,
  previewLogDataFingerprint,
} from "@/lib/preview-log-timeline"
import { THEME_PREVIEW_ADMIN_PANEL_PATH as ADMIN_PATH } from "../../src/lib/theme-preview-constants.js"

function sameStringSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false
  }
  return true
}

/** 底部「自动 / 手动」展示：持久化为空，或与当前解析出的自动依赖集一致，均视为自动 */
function syncFilesUiIsAutoMode(manualPersisted: string[], autoResolvedDeps: string[]) {
  if (manualPersisted.length === 0) return true
  if (autoResolvedDeps.length === 0) return false
  return sameStringSet(manualPersisted, autoResolvedDeps)
}

/** 日志区距底部超过此像素则视为用户在看历史，新日志不再自动滚到底 */
const LOG_SCROLL_BOTTOM_PX = 100

const PREVIEW_LOG_FILTER_OPTIONS: { value: PreviewLogFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "system", label: "系统" },
  { value: "page", label: "页面" },
  { value: "resource", label: "资源" },
]

type PreviewSyncSnapshot = {
  enabled: boolean
  status: string
  logs: string[]
  accessLogs?: string[]
  sessionPreview: string | null
  lastSyncedFileCount?: number
}

type RemotePageSummary = {
  id: string
  path: string
  template_name: string
  name: string
  template_variables?: Record<string, unknown>
}

type StaticPreviewRoute = {
  path: string
  rel: string
  slug: string
}

type DevMeta = {
  previewSession?: boolean
  previewOrigin?: string | null
  adminPath?: string
  localeTags?: string[]
  manualSyncTemplatePaths?: string[]
  templateBasenames?: string[]
  maxPreviewSyncFiles?: number
  staticPreviewRoutes?: StaticPreviewRoute[]
} | null

type SiteRow = { id: string; attributes?: { name?: string; hashid?: string; portal_url?: string } }

/** Open API `data.id` 多为数字主键；`theme_preview` 与之对齐，亦支持 Hashid。 */
function sitePickerId(row: SiteRow): string {
  const h = row.attributes?.hashid
  if (typeof h === "string" && h.trim()) return h.trim()
  return row.id
}

type RemotePage = {
  id: string
  path: string
  name: string
  template_name: string
  parent_id?: string | null
  template_variables?: Record<string, unknown>
  children?: RemotePage[]
}

type LocalPage = {
  localKey: string
  path: string
  template_name: string
  name: string
  content: string
}

function normalizePath(p: string) {
  let s = String(p || "/").trim()
  if (!s.startsWith("/")) s = `/${s}`
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1)
  return s || "/"
}

function normalizeTemplateName(t: unknown): string {
  const s = typeof t === "string" ? t.trim() : ""
  return s || "page"
}

/** 将 template_variables 规范为可 JSON 比较的对象（缺省视为 {}） */
function templateVariablesForCompare(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>
  }
  return {}
}

/** 递归按键名排序，避免 JSON.stringify 因键顺序不同把语义相同的对象判为不一致 */
function sortKeysDeepForCompare(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(o).sort()) {
      out[key] = sortKeysDeepForCompare(o[key])
    }
    return out
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeepForCompare)
  }
  return value
}

/** 规范化字符串：NFKC、NBSP/ZWSP、常见 Unicode 标点、换行、行尾空白 */
function normalizeMarkdownishString(s: string): string {
  let t = s.normalize("NFKC")
  t = t.replace(/[\u200e\u200f\u202a-\u202e]/g, "")
  t = t.replace(/\u00a0/g, " ").replace(/\u200b/g, "")
  t = t.replace(/\u2011/g, "-").replace(/\u2013/g, "-").replace(/\u2014/g, "-").replace(/\u2212/g, "-")
  t = t.replace(/\u2192/g, "->").replace(/\u2794/g, "->")
  t = t.replace(/\u2026/g, "...")
  t = t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  t = t
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
  return t.trim()
}

function normalizeStringsDeep(value: unknown): unknown {
  if (typeof value === "string") return normalizeMarkdownishString(value)
  if (Array.isArray(value)) return value.map(normalizeStringsDeep)
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(o)) {
      out[key] = normalizeStringsDeep(o[key])
    }
    return out
  }
  return value
}

/** 与列表 API 对比用：克隆去 undefined、规范化字符串、再稳定键序后序列化 */
function canonicalTemplateVariablesFingerprint(v: unknown): string {
  const t = templateVariablesForCompare(v)
  const cloned = JSON.parse(JSON.stringify(t)) as Record<string, unknown>
  const normalized = normalizeStringsDeep(cloned) as Record<string, unknown>
  return JSON.stringify(sortKeysDeepForCompare(normalized))
}

function flattenRemotePageSummaries(nodes: RemotePage[]): RemotePageSummary[] {
  const out: RemotePageSummary[] = []
  const walk = (n: RemotePage) => {
    out.push({
      id: n.id,
      path: normalizePath(n.path),
      template_name: n.template_name || "page",
      name: n.name,
      ...(n.template_variables &&
      typeof n.template_variables === "object" &&
      !Array.isArray(n.template_variables) &&
      Object.keys(n.template_variables).length > 0
        ? { template_variables: n.template_variables }
        : {}),
    })
    for (const c of n.children || []) walk(c)
  }
  for (const t of nodes) walk(t)
  return out
}

/** 首页固定为根节点，其余远端页面作为其直接子节点展示（便于折叠与浏览）。 */
function buildHomeFirstTree(pages: RemotePage[]): RemotePage[] {
  if (pages.length === 0) return []
  const copy = pages.map((p) => ({ ...p }))
  let homeIdx = copy.findIndex((p) => normalizePath(p.path) === "/")
  if (homeIdx < 0) homeIdx = copy.findIndex((p) => p.template_name === "index")
  if (homeIdx < 0) homeIdx = copy.findIndex((p) => /首页|^home$/i.test(String(p.name).trim()))
  if (homeIdx < 0) homeIdx = 0

  const home = copy[homeIdx]!
  const others = copy.filter((_, i) => i !== homeIdx)
  others.sort((a, b) => String(a.name).localeCompare(String(b.name)))

  return [
    {
      ...home,
      children: others.map((o) => ({ ...o, children: [] as RemotePage[] })),
    },
  ]
}

function openPathPreview(path: string, canOpen: boolean) {
  if (!canOpen || typeof window === "undefined") return
  const p = path.startsWith("/") ? path : `/${path}`
  window.open(new URL(p, window.location.origin).href, "_blank", "noopener,noreferrer")
}

function PageTitleButton({
  name,
  path,
  canOpenPathPreview,
  onBlockedPreviewTitleEnter,
  onBlockedPreviewTitleLeave,
}: {
  name: string
  path: string
  canOpenPathPreview: boolean
  onBlockedPreviewTitleEnter?: () => void
  onBlockedPreviewTitleLeave?: () => void
}) {
  const pathLabel = path.startsWith("/") ? path : `/${path}`
  const openHint = `在新标签打开：${pathLabel}`

  if (!canOpenPathPreview) {
    return (
      <span
        className="inline-flex max-w-full min-w-0 cursor-not-allowed items-center rounded-sm text-left opacity-70 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        tabIndex={0}
        aria-label={`${name}（预览未开启）`}
        onPointerEnter={() => onBlockedPreviewTitleEnter?.()}
        onPointerLeave={() => onBlockedPreviewTitleLeave?.()}
      >
        <span className="pointer-events-none inline-flex min-w-0 max-w-full">
          <button
            type="button"
            disabled
            className="text-foreground max-w-full cursor-not-allowed truncate text-left text-sm font-medium leading-snug"
          >
            {name}
          </button>
        </span>
      </span>
    )
  }

  return (
    <button
      type="button"
      title={openHint}
      className={cn(
        "text-foreground max-w-full truncate text-left text-sm font-medium leading-snug transition-colors",
        "cursor-pointer hover:text-primary hover:underline",
      )}
      onClick={() => openPathPreview(path, true)}
    >
      {name}
    </button>
  )
}

export default function App() {
  const [devMeta, setDevMeta] = useState<DevMeta>(null)
  const [devId, setDevId] = useState<string | null>(null)
  const [siteId, setSiteId] = useState("")
  const [sites, setSites] = useState<SiteRow[]>([])
  const [remotePages, setRemotePages] = useState<RemotePage[]>([])
  const [localPages, setLocalPages] = useState<LocalPage[]>([])
  const [pageTextSettings, setPageTextSettings] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState<string | null>(null)
  const [settingsDraft, setSettingsDraft] = useState("")
  const [settingsTemplateDraft, setSettingsTemplateDraft] = useState("")
  const [previewSnap, setPreviewSnap] = useState<PreviewSyncSnapshot | null>(null)
  const [previewToggleBusy, setPreviewToggleBusy] = useState(false)
  const previewLogScrollRef = useRef<HTMLDivElement>(null)
  const previewLogStickToBottomRef = useRef(true)
  const prevPreviewLogFingerprintRef = useRef("")
  const prevSiteIdRef = useRef<string | null>(null)
  const previewSyncSwitchDomId = useId().replace(/:/g, "")
  const previewSyncSwitchWrapRef = useRef<HTMLDivElement>(null)
  const nudgePreviewSyncSwitch = useCallback(() => {
    const el = previewSyncSwitchWrapRef.current
    if (!el) return
    el.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" })
    el.classList.remove("animate-preview-sync-nudge")
    void el.offsetHeight
    el.classList.add("animate-preview-sync-nudge")
  }, [])
  const [blockedPreviewHintOpen, setBlockedPreviewHintOpen] = useState(false)
  const blockedHintHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearBlockedPreviewHintTimer = useCallback(() => {
    if (blockedHintHideTimerRef.current != null) {
      clearTimeout(blockedHintHideTimerRef.current)
      blockedHintHideTimerRef.current = null
    }
  }, [])

  const scheduleBlockedPreviewHintClose = useCallback(() => {
    clearBlockedPreviewHintTimer()
    blockedHintHideTimerRef.current = window.setTimeout(() => {
      setBlockedPreviewHintOpen(false)
      blockedHintHideTimerRef.current = null
    }, 220)
  }, [clearBlockedPreviewHintTimer])

  const onBlockedPreviewTitleEnter = useCallback(() => {
    clearBlockedPreviewHintTimer()
    setBlockedPreviewHintOpen(true)
    nudgePreviewSyncSwitch()
  }, [clearBlockedPreviewHintTimer, nudgePreviewSyncSwitch])

  const onBlockedPreviewTitleLeave = useCallback(() => {
    scheduleBlockedPreviewHintClose()
  }, [scheduleBlockedPreviewHintClose])

  const onBlockedPreviewHintHoverEnter = useCallback(() => {
    clearBlockedPreviewHintTimer()
  }, [clearBlockedPreviewHintTimer])

  const onBlockedPreviewHintHoverLeave = useCallback(() => {
    scheduleBlockedPreviewHintClose()
  }, [scheduleBlockedPreviewHintClose])

  const [addOpen, setAddOpen] = useState(false)
  const [addContextPath, setAddContextPath] = useState<string | null>(null)
  const [addSlug, setAddSlug] = useState("demo-page")
  const [addTemplate, setAddTemplate] = useState("page")
  const [addTitle, setAddTitle] = useState("")
  const [deleteLocalKey, setDeleteLocalKey] = useState<string | null>(null)
  const [previewLogFilter, setPreviewLogFilter] = useState<PreviewLogFilter>("all")
  const [portalUrl, setPortalUrl] = useState("")
  const [previewLocale, setPreviewLocale] = useState("zh-CN")
  const [previewSyncManualPaths, setPreviewSyncManualPaths] = useState<string[]>([])
  const [remotePagesSummary, setRemotePagesSummary] = useState<RemotePageSummary[]>([])
  const [pageTextSettingsBaseline, setPageTextSettingsBaseline] = useState<Record<string, unknown>>({})
  const [remotePathOverrides, setRemotePathOverrides] = useState<Record<string, { template_name?: string }>>({})
  const [remotePathOverridesBaseline, setRemotePathOverridesBaseline] = useState<
    Record<string, { template_name?: string }>
  >({})
  const [syncPickerOpen, setSyncPickerOpen] = useState(false)
  const [syncPickerDraft, setSyncPickerDraft] = useState<string[]>([])
  const [syncPickerLoading, setSyncPickerLoading] = useState(false)
  const [previewAutoLiquidPaths, setPreviewAutoLiquidPaths] = useState<string[]>([])
  /** 在「页面设置」里点过保存的远端页 id；未在此集合中的页每次 loadPages 会用列表 API 覆盖本地变量（避免与持久化字节微差误报红点） */
  const [remoteTemplateVarsUserSavedIds, setRemoteTemplateVarsUserSavedIds] = useState<string[]>([])
  const userSavedRemoteTemplateVarsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    userSavedRemoteTemplateVarsRef.current = new Set(remoteTemplateVarsUserSavedIds)
  }, [remoteTemplateVarsUserSavedIds])

  const pathPreviewInfrastructureReady = useMemo(
    () =>
      Boolean(
        devMeta?.previewSession ||
          (Boolean(previewSnap?.enabled) && Boolean(previewSnap?.sessionPreview)),
      ),
    [devMeta?.previewSession, previewSnap?.enabled, previewSnap?.sessionPreview],
  )

  /** 仅当底部「同步模版到预览」为开启态且服务端具备会话时，才允许点击标题做路径预览 */
  const canOpenPathPreview = useMemo(
    () => Boolean(previewSnap?.enabled) && pathPreviewInfrastructureReady,
    [previewSnap?.enabled, pathPreviewInfrastructureReady],
  )

  useEffect(() => {
    return () => clearBlockedPreviewHintTimer()
  }, [clearBlockedPreviewHintTimer])

  useEffect(() => {
    if (canOpenPathPreview) {
      setBlockedPreviewHintOpen(false)
      clearBlockedPreviewHintTimer()
    }
  }, [canOpenPathPreview, clearBlockedPreviewHintTimer])

  useEffect(() => {
    if (!devMeta?.manualSyncTemplatePaths?.length) return
    const ac = new AbortController()
    void (async () => {
      try {
        const r = await fetch("/api/baklib/preview-sync-auto-liquid-paths", {
          credentials: "include",
          signal: ac.signal,
        })
        const j = (await r.json()) as { paths?: string[]; error?: string }
        if (r.ok && Array.isArray(j.paths)) setPreviewAutoLiquidPaths(j.paths)
      } catch {
        /* ignore（含 Abort） */
      }
    })()
    return () => ac.abort()
  }, [devMeta?.manualSyncTemplatePaths, devMeta?.maxPreviewSyncFiles, previewLocale])

  const tree = useMemo(() => buildHomeFirstTree(remotePages), [remotePages])

  const previewLogTimeline = useMemo(
    () => buildPreviewLogTimeline(previewSnap?.accessLogs, previewSnap?.logs, previewLogFilter),
    [previewSnap?.accessLogs, previewSnap?.logs, previewLogFilter],
  )

  const previewLogEmptyHint = useMemo(() => {
    if (previewLogFilter === "all") {
      return "（站点访问、资源请求与同步/监控日志将按时间顺序显示在此处）"
    }
    if (previewLogFilter === "page") {
      return "（暂无页面类请求）"
    }
    if (previewLogFilter === "resource") {
      return "（暂无资源类请求）"
    }
    return "（暂无系统类日志：同步/监控与重定向等）"
  }, [previewLogFilter])

  const selectedSite = useMemo(
    () => sites.find((s) => sitePickerId(s) === siteId),
    [sites, siteId],
  )
  const selectedSiteName =
    (selectedSite?.attributes && selectedSite.attributes.name) || sitePickerId(selectedSite ?? { id: "" }) || ""

  const previewLocaleItems = useMemo(() => {
    const tags = devMeta?.localeTags?.length ? [...devMeta.localeTags] : ["zh-CN"]
    if (previewLocale.trim() && !tags.includes(previewLocale)) tags.push(previewLocale)
    return tags.map((tag) => ({ label: tag, value: tag }))
  }, [devMeta?.localeTags, previewLocale])

  const settingsTemplateItems = useMemo(() => {
    const base = devMeta?.templateBasenames?.length ? [...devMeta.templateBasenames] : ["page", "index"]
    const t = settingsTemplateDraft.trim()
    if (t && !base.includes(t)) base.push(t)
    return base.map((name) => ({ label: name, value: name }))
  }, [devMeta?.templateBasenames, settingsTemplateDraft])

  const settingsTemplateSelectValue = useMemo(() => {
    if (!settingsTemplateItems.length) return settingsTemplateDraft.trim() || "page"
    if (settingsTemplateItems.some((i) => i.value === settingsTemplateDraft)) return settingsTemplateDraft
    return settingsTemplateItems[0]!.value
  }, [settingsTemplateItems, settingsTemplateDraft])

  const persistState = useCallback(
    async (next: {
      siteId: string
      localPages: LocalPage[]
      pageTextSettings: Record<string, unknown>
      portalUrl: string
      previewLocale: string
      previewSyncManualPaths: string[]
      remotePagesSummary: RemotePageSummary[]
      pageTextSettingsBaseline: Record<string, unknown>
      remotePathOverrides: Record<string, { template_name?: string }>
      remotePathOverridesBaseline: Record<string, { template_name?: string }>
      remoteTemplateVarsUserSavedIds: string[]
    }) => {
      const body = {
        state: {
          siteId: next.siteId,
          localPages: next.localPages,
          pageTextSettings: next.pageTextSettings,
          portalUrl: next.portalUrl,
          previewLocale: next.previewLocale,
          previewSyncManualPaths: next.previewSyncManualPaths,
          remotePagesSummary: next.remotePagesSummary,
          pageTextSettingsBaseline: next.pageTextSettingsBaseline,
          remotePathOverrides: next.remotePathOverrides,
          remotePathOverridesBaseline: next.remotePathOverridesBaseline,
          remoteTemplateVarsUserSavedIds: next.remoteTemplateVarsUserSavedIds,
        },
      }
      await fetch("/api/baklib/dev-state", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    },
    [],
  )

  const refreshDevMeta = useCallback(async (opts?: { signal?: AbortSignal }) => {
    try {
      const rm = await fetch("/api/baklib/dev-meta", {
        credentials: "include",
        signal: opts?.signal,
      })
      const mj = (await rm.json()) as DevMeta
      if (rm.ok) setDevMeta(mj)
    } catch {
      /* ignore（含 Abort） */
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void refreshDevMeta({ signal: ac.signal })
    return () => ac.abort()
  }, [refreshDevMeta])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch("/api/baklib/dev-state", { credentials: "include" })
        const j = (await r.json()) as { id?: string; state?: Record<string, unknown>; error?: string }
        if (!r.ok) throw new Error(j.error || r.statusText)
        if (cancelled) return
        setDevId(j.id ?? null)
        const st = j.state || {}
        setSiteId(typeof st.siteId === "string" ? st.siteId : "")
        setPortalUrl(typeof st.portalUrl === "string" ? st.portalUrl : "")
        setPreviewLocale(typeof st.previewLocale === "string" && st.previewLocale.trim() ? st.previewLocale.trim() : "zh-CN")
        setPreviewSyncManualPaths(Array.isArray(st.previewSyncManualPaths) ? (st.previewSyncManualPaths as string[]) : [])
        const restoredSummary = Array.isArray(st.remotePagesSummary) ? (st.remotePagesSummary as RemotePageSummary[]) : []
        setRemotePagesSummary(restoredSummary)
        setRemoteTemplateVarsUserSavedIds(
          Array.isArray(st.remoteTemplateVarsUserSavedIds)
            ? (st.remoteTemplateVarsUserSavedIds as string[]).filter((x) => typeof x === "string" && x.trim())
            : [],
        )
        setPageTextSettingsBaseline(
          typeof st.pageTextSettingsBaseline === "object" && st.pageTextSettingsBaseline
            ? (st.pageTextSettingsBaseline as Record<string, unknown>)
            : {},
        )
        setRemotePathOverrides(
          typeof st.remotePathOverrides === "object" && st.remotePathOverrides
            ? (st.remotePathOverrides as Record<string, { template_name?: string }>)
            : {},
        )
        setRemotePathOverridesBaseline(
          typeof st.remotePathOverridesBaseline === "object" && st.remotePathOverridesBaseline
            ? (st.remotePathOverridesBaseline as Record<string, { template_name?: string }>)
            : {},
        )
        setLocalPages(Array.isArray(st.localPages) ? (st.localPages as LocalPage[]) : [])
        setPageTextSettings(
          typeof st.pageTextSettings === "object" && st.pageTextSettings
            ? (st.pageTextSettings as Record<string, unknown>)
            : {},
        )
      } catch (e) {
        if (!cancelled) appNotify(String((e as Error).message || e), "error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!devId) return undefined
    const t = setTimeout(() => {
      persistState({
        siteId,
        localPages,
        pageTextSettings,
        portalUrl,
        previewLocale,
        previewSyncManualPaths,
        remotePagesSummary,
        pageTextSettingsBaseline,
        remotePathOverrides,
        remotePathOverridesBaseline,
        remoteTemplateVarsUserSavedIds,
      }).catch((e) => appNotify(String((e as Error).message || e), "error"))
    }, 400)
    return () => clearTimeout(t)
  }, [
    devId,
    siteId,
    localPages,
    pageTextSettings,
    portalUrl,
    previewLocale,
    previewSyncManualPaths,
    remotePagesSummary,
    pageTextSettingsBaseline,
    remotePathOverrides,
    remotePathOverridesBaseline,
    remoteTemplateVarsUserSavedIds,
    persistState,
  ])

  useEffect(() => {
    if (!siteId) {
      setPortalUrl("")
      setRemotePagesSummary([])
      return
    }
    if (!sites.length) return
    const row = sites.find((s) => sitePickerId(s) === siteId)
    setPortalUrl(String(row?.attributes?.portal_url ?? "").trim())
  }, [siteId, sites])

  useEffect(() => {
    const prev = prevSiteIdRef.current
    prevSiteIdRef.current = siteId
    if (prev != null && prev !== "" && prev !== siteId) {
      setPreviewSyncManualPaths([])
      setRemotePathOverrides({})
      setRemotePathOverridesBaseline({})
      setPageTextSettingsBaseline({})
      setRemoteTemplateVarsUserSavedIds([])
    }
  }, [siteId])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const r = await fetch("/api/baklib/preview-sync-state", { credentials: "include" })
        const j = (await r.json()) as PreviewSyncSnapshot
        if (!cancelled && r.ok)
          setPreviewSnap({
            ...j,
            logs: Array.isArray(j.logs) ? j.logs : [],
            accessLogs: Array.isArray(j.accessLogs) ? j.accessLogs : [],
            lastSyncedFileCount:
              typeof j.lastSyncedFileCount === "number" ? j.lastSyncedFileCount : undefined,
          })
      } catch {
        /* ignore */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 750)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const onPreviewLogsScroll = useCallback(() => {
    const el = previewLogScrollRef.current
    if (!el) return
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    previewLogStickToBottomRef.current = gap <= LOG_SCROLL_BOTTOM_PX
  }, [])

  useLayoutEffect(() => {
    const fp = previewLogDataFingerprint(previewSnap?.accessLogs, previewSnap?.logs)
    if (fp === prevPreviewLogFingerprintRef.current) return
    prevPreviewLogFingerprintRef.current = fp

    if (!previewLogStickToBottomRef.current) return

    const el = previewLogScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [previewSnap?.logs, previewSnap?.accessLogs])

  const setPreviewSyncEnabled = async (enabled: boolean) => {
    setPreviewToggleBusy(true)
    try {
      const r = await fetch("/api/baklib/preview-sync-toggle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      const j = (await r.json()) as { ok?: boolean; error?: string } & PreviewSyncSnapshot
      if (!r.ok) throw new Error(j.error || r.statusText)
      setPreviewSnap({
        enabled: Boolean(j.enabled),
        status: String(j.status || ""),
        logs: Array.isArray(j.logs) ? j.logs : [],
        accessLogs: Array.isArray(j.accessLogs) ? j.accessLogs : [],
        sessionPreview: j.sessionPreview ?? null,
        lastSyncedFileCount:
          typeof j.lastSyncedFileCount === "number" ? j.lastSyncedFileCount : undefined,
      })
      await refreshDevMeta()
      appNotify(enabled ? "已开启「同步模版到预览」" : "已关闭「同步模版到预览」", "success")
    } catch (e) {
      appNotify(String((e as Error).message || e), "error")
    } finally {
      setPreviewToggleBusy(false)
    }
  }

  const loadSites = async () => {
    setBusy(true)
    try {
      const r = await fetch("/api/baklib/sites", { credentials: "include" })
      const j = (await r.json()) as { data?: SiteRow[]; error?: string }
      if (!r.ok) throw new Error(j.error || r.statusText)
      setSites(Array.isArray(j.data) ? j.data : [])
    } catch (e) {
      appNotify(String((e as Error).message || e), "error")
    } finally {
      setBusy(false)
    }
  }

  const loadPages = async (sid: string) => {
    if (!sid) return
    setBusy(true)
    try {
      const r = await fetch(`/api/baklib/sites/${encodeURIComponent(sid)}/pages`, {
        credentials: "include",
      })
      const j = await r.json()
      if (!r.ok) throw new Error((j as { error?: string }).error || r.statusText)
      const rows = jsonApiDataArray(j)
      const rp = jsonApiRowsToRemotePageRows(rows) as RemotePage[]
      const treeBuilt = buildHomeFirstTree(rp)
      setRemotePages(rp)
      setRemotePagesSummary(flattenRemotePageSummaries(treeBuilt))

      const baselinePatch: Record<string, Record<string, unknown>> = {}
      const baselineDelete = new Set<string>()
      const saved = userSavedRemoteTemplateVarsRef.current

      setPageTextSettings((prev) => {
        const next = { ...prev }
        const walk = (n: RemotePage) => {
          const k = `remote:${n.id}`
          const tv = n.template_variables
          if (!saved.has(n.id)) {
            if (tv && typeof tv === "object" && !Array.isArray(tv)) {
              if (Object.keys(tv).length > 0) {
                const clone = JSON.parse(JSON.stringify(tv)) as Record<string, unknown>
                next[k] = clone
                baselinePatch[k] = clone
              } else {
                next[k] = {}
                baselinePatch[k] = {}
              }
            } else {
              delete next[k]
              baselineDelete.add(k)
            }
          } else if (tv && typeof tv === "object" && !Array.isArray(tv) && Object.keys(tv).length > 0) {
            const ex = next[k]
            const empty =
              ex === undefined ||
              ex === null ||
              (typeof ex === "object" && !Array.isArray(ex) && Object.keys(ex as object).length === 0)
            if (empty) {
              const clone = JSON.parse(JSON.stringify(tv)) as Record<string, unknown>
              next[k] = clone
              baselinePatch[k] = clone
            }
          }
          for (const c of n.children || []) walk(c)
        }
        for (const root of treeBuilt) walk(root)
        return next
      })

      if (Object.keys(baselinePatch).length > 0 || baselineDelete.size > 0) {
        setPageTextSettingsBaseline((b) => {
          const nb = { ...b, ...baselinePatch }
          for (const dk of baselineDelete) delete nb[dk]
          return nb
        })
      }
    } catch (e) {
      appNotify(String((e as Error).message || e), "error")
    } finally {
      setBusy(false)
      void refreshDevMeta()
    }
  }

  useEffect(() => {
    void loadSites()
  }, [])

  useEffect(() => {
    if (siteId) void loadPages(siteId)
  }, [siteId])

  const openAddLocalFromContext = (contextPath: string) => {
    setAddContextPath(contextPath)
    setAddSlug("")
    setAddTemplate("page")
    setAddTitle("")
    setAddOpen(true)
  }

  const submitAddLocal = () => {
    const slug = addSlug.trim()
    if (!slug) {
      appNotify("请填写 slug", "warning")
      return
    }
    const template_name = addTemplate.trim() || "page"
    const name = (addTitle.trim() || slug).trim()
    const path = normalizePath(slug)
    const localKey = `l_${Math.random().toString(36).slice(2, 10)}`
    setLocalPages((prev) => [...prev, { localKey, path, template_name, name, content: "" }])
    setAddOpen(false)
    setAddContextPath(null)
    appNotify("已添加本地页面", "success")
  }

  const confirmDeleteLocal = () => {
    if (!deleteLocalKey) return
    const k = `local:${deleteLocalKey}`
    setLocalPages((prev) => prev.filter((p) => p.localKey !== deleteLocalKey))
    setPageTextSettings((prev) => {
      const { [k]: _, ...rest } = prev
      return rest
    })
    setDeleteLocalKey(null)
    appNotify("已删除本地页面", "success")
  }

  const openSettingsWithBaseline = (key: string) => {
    const cur = pageTextSettings[key] || {}
    setSettingsDraft(JSON.stringify(cur, null, 2))
    setSettingsOpen(key)

    if (key.startsWith("local:")) {
      const lk = key.slice("local:".length)
      const lp = localPages.find((p) => p.localKey === lk)
      const tn = lp?.template_name?.trim() || "page"
      setSettingsTemplateDraft(tn)
      return
    }

    if (key.startsWith("remote:")) {
      const pageId = key.slice("remote:".length)
      const row = remotePagesSummary.find((r) => r.id === pageId)
      if (row) {
        const pathNorm = normalizePath(row.path)
        const raw = remotePathOverrides[pathNorm]?.template_name ?? row.template_name
        setSettingsTemplateDraft(typeof raw === "string" && raw.trim() ? raw.trim() : "page")
        setPageTextSettingsBaseline((b) => {
          if (b[key] !== undefined) return b
          return { ...b, [key]: JSON.parse(JSON.stringify(cur)) as Record<string, unknown> }
        })
        setRemotePathOverridesBaseline((b) => {
          if (b[pathNorm] !== undefined) return b
          const ov = remotePathOverrides[pathNorm] || {}
          return { ...b, [pathNorm]: JSON.parse(JSON.stringify(ov)) }
        })
      } else {
        setSettingsTemplateDraft("page")
      }
      return
    }

    setSettingsTemplateDraft("page")
  }

  const saveSettings = () => {
    let parsed: Record<string, unknown> = {}
    try {
      parsed = settingsDraft.trim() ? (JSON.parse(settingsDraft) as Record<string, unknown>) : {}
    } catch {
      appNotify("参数 JSON 无效", "error")
      return
    }
    const key = settingsOpen
    if (!key) return
    const template_name = settingsTemplateDraft.trim() || "page"

    if (key.startsWith("remote:")) {
      const pageId = key.slice("remote:".length)
      setRemoteTemplateVarsUserSavedIds((prev) => (prev.includes(pageId) ? prev : [...prev, pageId]))
      const row = remotePagesSummary.find((r) => r.id === pageId)
      if (row) {
        const pathNorm = normalizePath(row.path)
        const baseName = ((row.template_name || "page") as string).trim() || "page"
        setRemotePathOverrides((prev) => {
          const next = { ...prev }
          if (template_name === baseName && Object.keys(prev[pathNorm] || {}).length <= 1) {
            delete next[pathNorm]
          } else {
            next[pathNorm] = { ...prev[pathNorm], template_name }
          }
          return next
        })
      }
    } else if (key.startsWith("local:")) {
      const lk = key.slice("local:".length)
      setLocalPages((prev) =>
        prev.map((p) => (p.localKey === lk ? { ...p, template_name } : p)),
      )
    }

    setPageTextSettings((prev) => ({ ...prev, [key]: parsed }))
    setSettingsOpen(null)
    appNotify("页面设置已保存", "success")
  }

  const resetOpenRemoteSettings = () => {
    const key = settingsOpen
    if (!key?.startsWith("remote:")) return
    const pageId = key.slice("remote:".length)
    const row = remotePagesSummary.find((r) => r.id === pageId)
    if (!row) return
    const pathNorm = normalizePath(row.path)
    const tv = row.template_variables
    const restoredVars =
      tv && typeof tv === "object" && !Array.isArray(tv)
        ? (JSON.parse(JSON.stringify(tv)) as Record<string, unknown>)
        : ({} as Record<string, unknown>)

    setRemoteTemplateVarsUserSavedIds((prev) => prev.filter((id) => id !== pageId))
    setPageTextSettings((prev) => ({ ...prev, [key]: restoredVars }))
    setPageTextSettingsBaseline((b) => ({
      ...b,
      [key]: JSON.parse(JSON.stringify(restoredVars)) as Record<string, unknown>,
    }))
    setRemotePathOverrides((prev) => {
      const next = { ...prev }
      const base = remotePathOverridesBaseline[pathNorm] ?? {}
      if (Object.keys(base).length) next[pathNorm] = JSON.parse(JSON.stringify(base))
      else delete next[pathNorm]
      return next
    })
    setSettingsDraft(JSON.stringify(restoredVars, null, 2))
    const baseOv = remotePathOverridesBaseline[pathNorm] ?? {}
    const tmpl =
      typeof baseOv.template_name === "string" && baseOv.template_name.trim()
        ? baseOv.template_name.trim()
        : ((row.template_name || "page") as string).trim() || "page"
    setSettingsTemplateDraft(tmpl)
    appNotify("已恢复为当前列表中的远端变量与打开时的模版覆盖", "success")
  }

  const remoteDirtyById = useMemo(() => {
    const m: Record<string, boolean> = {}
    const userSaved = new Set(remoteTemplateVarsUserSavedIds)
    for (const row of remotePagesSummary) {
      if (!userSaved.has(row.id)) {
        m[row.id] = false
        continue
      }
      const k = `remote:${row.id}`
      const pathNorm = normalizePath(row.path)
      const jsonDirty =
        canonicalTemplateVariablesFingerprint(row.template_variables) !==
        canonicalTemplateVariablesFingerprint(pageTextSettings[k])
      const apiT = normalizeTemplateName(row.template_name)
      const effT = normalizeTemplateName(remotePathOverrides[pathNorm]?.template_name ?? row.template_name)
      const templateDirty = effT !== apiT
      m[row.id] = jsonDirty || templateDirty
    }
    return m
  }, [remotePagesSummary, pageTextSettings, remoteTemplateVarsUserSavedIds, remotePathOverrides])

  const localSettingsDirtyByKey = useMemo(() => {
    const m: Record<string, boolean> = {}
    const emptyFp = canonicalTemplateVariablesFingerprint({})
    for (const lp of localPages) {
      const k = `local:${lp.localKey}`
      m[lp.localKey] =
        canonicalTemplateVariablesFingerprint(pageTextSettings[k]) !== emptyFp
    }
    return m
  }, [localPages, pageTextSettings])

  const settingsPanelDirty = useMemo(() => {
    if (!settingsOpen) return { template: false, params: false }
    if (settingsOpen.startsWith("remote:")) {
      const pageId = settingsOpen.slice("remote:".length)
      const row = remotePagesSummary.find((r) => r.id === pageId)
      if (!row) return { template: false, params: false }
      let paramsDirty = false
      try {
        const parsed = settingsDraft.trim() ? (JSON.parse(settingsDraft) as Record<string, unknown>) : {}
        paramsDirty =
          canonicalTemplateVariablesFingerprint(parsed) !==
          canonicalTemplateVariablesFingerprint(row.template_variables)
      } catch {
        paramsDirty = true
      }
      const templateDirty =
        normalizeTemplateName(settingsTemplateDraft) !== normalizeTemplateName(row.template_name)
      return { template: templateDirty, params: paramsDirty }
    }
    if (settingsOpen.startsWith("local:")) {
      const lk = settingsOpen.slice("local:".length)
      const lp = localPages.find((p) => p.localKey === lk)
      if (!lp) return { template: false, params: false }
      let paramsDirty = false
      try {
        const parsed = settingsDraft.trim() ? (JSON.parse(settingsDraft) as Record<string, unknown>) : {}
        paramsDirty =
          canonicalTemplateVariablesFingerprint(parsed) !== canonicalTemplateVariablesFingerprint({})
      } catch {
        paramsDirty = true
      }
      const templateDirty =
        normalizeTemplateName(settingsTemplateDraft) !== normalizeTemplateName(lp.template_name)
      return { template: templateDirty, params: paramsDirty }
    }
    return { template: false, params: false }
  }, [
    settingsOpen,
    settingsDraft,
    settingsTemplateDraft,
    remotePagesSummary,
    localPages,
  ])

  const settingsListOriginalTemplate = useMemo(() => {
    if (!settingsOpen?.startsWith("remote:") && !settingsOpen?.startsWith("local:")) return null
    if (settingsOpen.startsWith("remote:")) {
      const pageId = settingsOpen.slice("remote:".length)
      const row = remotePagesSummary.find((r) => r.id === pageId)
      return row ? normalizeTemplateName(row.template_name) : null
    }
    const lk = settingsOpen.slice("local:".length)
    const lp = localPages.find((p) => p.localKey === lk)
    return lp ? normalizeTemplateName(lp.template_name) : null
  }, [settingsOpen, remotePagesSummary, localPages])

  /** 持久化有 400ms 防抖：重置后若立刻刷新，磁盘里的「已保存 id」可能仍含本页。此处按当前列表与表单内容自愈剔除已与 API 一致的 id。 */
  useEffect(() => {
    setRemoteTemplateVarsUserSavedIds((prev) => {
      if (!prev.length) return prev
      const next = prev.filter((id) => {
        const row = remotePagesSummary.find((r) => r.id === id)
        if (!row) return true
        const k = `remote:${id}`
        const pathNorm = normalizePath(row.path)
        const jsonDirty =
          canonicalTemplateVariablesFingerprint(row.template_variables) !==
          canonicalTemplateVariablesFingerprint(pageTextSettings[k])
        const apiT = normalizeTemplateName(row.template_name)
        const effT = normalizeTemplateName(remotePathOverrides[pathNorm]?.template_name ?? row.template_name)
        const templateDirty = effT !== apiT
        return jsonDirty || templateDirty
      })
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev
      return next
    })
  }, [remotePagesSummary, pageTextSettings, remotePathOverrides])

  const maxManualLiquidSlots = Math.max(0, (devMeta?.maxPreviewSyncFiles ?? 20) - 3)
  const syncFilesIsAutoUi = syncFilesUiIsAutoMode(previewSyncManualPaths, previewAutoLiquidPaths)

  const openSyncFilesDialog = () => {
    void (async () => {
      setSyncPickerOpen(true)
      setSyncPickerLoading(true)
      try {
        const r = await fetch("/api/baklib/preview-sync-auto-liquid-paths", { credentials: "include" })
        const j = (await r.json()) as { paths?: string[]; error?: string }
        if (!r.ok) throw new Error(j.error || r.statusText)
        const paths = Array.isArray(j.paths) ? j.paths : []
        setPreviewAutoLiquidPaths(paths)
        setSyncPickerDraft([...paths])
      } catch (e) {
        appNotify(String((e as Error).message || e), "error")
        setSyncPickerOpen(false)
      } finally {
        setSyncPickerLoading(false)
      }
    })()
  }

  const saveSyncFilesDialog = () => {
    if (syncPickerDraft.length > maxManualLiquidSlots) {
      appNotify(`手动勾选模板最多 ${maxManualLiquidSlots} 个（需为语言包与 config 预留约 3 个名额）`, "error")
      return
    }
    const auto = previewAutoLiquidPaths
    const draft = syncPickerDraft
    const persistAuto = draft.length === 0 || (auto.length > 0 && sameStringSet(draft, auto))
    setPreviewSyncManualPaths(persistAuto ? [] : [...draft])
    setSyncPickerOpen(false)
    appNotify(
      persistAuto ? "已保存：将按入口模板依赖自动选择同步文件" : "已保存：按当前勾选手动同步",
      "success",
    )
  }

  const onSyncTreeHitCap = () => {
    appNotify(`手动勾选模板最多 ${maxManualLiquidSlots} 个（需为语言包与 config 预留约 3 个名额）`, "warning")
  }

  if (typeof window !== "undefined" && window.location.pathname !== ADMIN_PATH) {
    return (
      <div className="text-foreground bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-8 font-sans">
        <p className="text-muted-foreground text-sm">请访问固定地址：</p>
        <Button variant="outline" render={<a href={ADMIN_PATH} />}>
          {ADMIN_PATH}
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-background text-foreground flex h-svh min-h-0 font-sans">
      {/* 左侧：导航 + 站点 */}
      <aside className="border-border bg-card flex w-[min(100%,20rem)] shrink-0 flex-col border-e">
        <div className="border-border shrink-0 space-y-1 border-b p-3">
          <h1 className="font-heading text-sm font-semibold leading-tight">主题开发</h1>
          <p className="text-muted-foreground text-xs leading-snug">
            站点与页面只读拉取；本地页与 JSON 参数仅存本机内存。
          </p>
        </div>

        <ScrollArea scrollFade className="min-h-0 flex-1" scrollbarGutter>
          <div className="space-y-3 p-3">
            {devMeta && !canOpenPathPreview && (
              <Alert variant="info" className="text-xs">
                <AlertTitle className="text-xs">路径 HTML 预览未就绪</AlertTitle>
                <AlertDescription className="text-xs leading-relaxed">
                  请在<strong className="text-foreground">右侧底部</strong>打开「同步模版到预览」开关：将创建服务端预览会话、上传主题并监听文件变更。
                </AlertDescription>
              </Alert>
            )}
            {canOpenPathPreview && (
              <Alert variant="success" className="text-xs">
                <AlertTitle className="text-xs">路径 HTML 预览已就绪</AlertTitle>
                <AlertDescription className="text-xs">
                  点击页面标题可在新标签打开服务端预览 HTML；外链 https 资源经同源{" "}
                  <code className="bg-background/80 rounded px-0.5 font-mono">/__baklib_proxy</code> 中转。
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                站点
              </span>
              <Button
                size="xs"
                variant="outline"
                type="button"
                loading={busy}
                onClick={() => void loadSites()}
                className="shrink-0 gap-1"
              >
                <RefreshCw aria-hidden className="size-3" />
                刷新列表
              </Button>
            </div>

            {sites.length === 0 ? (
              <p className="text-muted-foreground px-1 text-xs leading-relaxed">
                暂无站点。请点击「刷新列表」从 Open API 拉取。
              </p>
            ) : (
              <ul className="space-y-0.5" role="list">
                {sites.map((s) => {
                  const pick = sitePickerId(s)
                  const label = (s.attributes && s.attributes.name) || pick
                  const active = siteId === pick
                  return (
                    <li key={pick}>
                      <button
                        type="button"
                        onClick={() => setSiteId(pick)}
                        className={cn(
                          "hover:bg-accent/80 focus-visible:ring-ring flex w-full min-w-0 rounded-lg px-2 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
                          active && "bg-accent text-accent-foreground font-medium",
                        )}
                      >
                        <span className="truncate">{label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </ScrollArea>

        <Separator />

        <div className="border-border shrink-0 space-y-2 border-t p-3">
          {siteId ? (
            <Button variant="ghost" size="sm" type="button" className="w-full text-xs" onClick={() => setSiteId("")}>
              清空站点选择
            </Button>
          ) : null}
          <p className="text-muted-foreground text-center text-[10px] leading-relaxed">
            按 <kbd className="bg-muted rounded px-1 font-mono">d</kbd> 切换明暗主题
          </p>
        </div>
      </aside>

      {/* 右侧：欢迎或页面树 + 底部预览同步 */}
      <main className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {!siteId ? (
              <Empty className="h-full min-h-[20rem]">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <LayoutTemplate aria-hidden className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>欢迎使用主题开发面板</EmptyTitle>
                  <EmptyDescription>
                    请先在左侧点击 <strong className="text-foreground">「刷新列表」</strong>
                    拉取站点，再在列表中<strong className="text-foreground">选择一个站点</strong>
                    。选中后，此处将展示以<strong className="text-foreground">首页为根</strong>
                    的页面树；在<strong className="text-foreground">右下方</strong>打开「同步模版到预览」后，可点击
                    <strong className="text-foreground">页面标题</strong>
                    在新标签预览服务端 HTML。在任意远端页面行可点「添加本地页面」。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ScrollArea scrollFade className="h-full min-h-0" scrollbarGutter>
                <div className="space-y-4 p-4 pb-10">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-foreground truncate text-lg font-semibold leading-tight">
                        {selectedSiteName}
                      </h2>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        首页固定为根，其余远端页为其子项；开启右下方同步后，可点击标题在新标签打开预览。在任意页面行可点「添加本地页面」。
                      </p>
                    </div>
                  </div>

                  <section aria-labelledby="remote-tree-heading">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 id="remote-tree-heading" className="text-muted-foreground text-xs font-medium uppercase">
                        远端页面
                      </h3>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="shrink-0 gap-1"
                        disabled={!siteId}
                        loading={busy}
                        onClick={() => void loadPages(siteId)}
                      >
                        <RefreshCw aria-hidden className="size-3" />
                        刷新页面
                      </Button>
                    </div>
                    {tree.length === 0 ? (
                      <p className="text-muted-foreground border-border/60 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
                        该站点暂无页面数据，或列表仍为空。可尝试上方「刷新页面」。
                      </p>
                    ) : (
                      <ul className="space-y-0" role="tree">
                        {tree.map((n) => (
                          <PageTreeNode
                            key={n.id}
                            node={n}
                            depth={0}
                            canOpenPathPreview={canOpenPathPreview}
                            onBlockedPreviewTitleEnter={onBlockedPreviewTitleEnter}
                            onBlockedPreviewTitleLeave={onBlockedPreviewTitleLeave}
                            onSettings={openSettingsWithBaseline}
                            onAddLocal={openAddLocalFromContext}
                            remotePathOverrides={remotePathOverrides}
                            remoteDirtyById={remoteDirtyById}
                          />
                        ))}
                      </ul>
                    )}
                  </section>

                  <section aria-labelledby="static-pages-heading">
                    <h3 id="static-pages-heading" className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                      静态页面
                    </h3>
                    {(devMeta?.staticPreviewRoutes?.length ?? 0) > 0 ? (
                      <ul className="space-y-2">
                        {(devMeta?.staticPreviewRoutes ?? []).map((row) => (
                          <li
                            key={row.path}
                            className="border-border hover:bg-muted/40 flex flex-wrap items-start gap-2 rounded-xl border px-3 py-2.5 transition-colors"
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <PageTitleButton
                                  name={row.slug}
                                  path={row.path}
                                  canOpenPathPreview={canOpenPathPreview}
                                  onBlockedPreviewTitleEnter={onBlockedPreviewTitleEnter}
                                  onBlockedPreviewTitleLeave={onBlockedPreviewTitleLeave}
                                />
                                <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                                  <FileText aria-hidden className="size-3" />
                                  静态
                                </Badge>
                              </div>
                              <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
                                <code className="font-mono">{row.path}</code>
                                <span aria-hidden>·</span>
                                <span>
                                  模版 <span className="font-mono">{row.rel}</span>
                                </span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground border-border/60 rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                        暂无静态页面。
                      </p>
                    )}
                  </section>

                  <section aria-labelledby="local-pages-heading">
                    <h3 id="local-pages-heading" className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                      本地页面
                    </h3>
                    {localPages.length > 0 ? (
                      <ul className="space-y-2">
                        {localPages.map((lp) => (
                          <li
                            key={lp.localKey}
                            className="border-border hover:bg-muted/40 flex flex-wrap items-start gap-2 rounded-xl border px-3 py-2.5 transition-colors"
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <PageTitleButton
                                  name={lp.name}
                                  path={lp.path}
                                  canOpenPathPreview={canOpenPathPreview}
                                  onBlockedPreviewTitleEnter={onBlockedPreviewTitleEnter}
                                  onBlockedPreviewTitleLeave={onBlockedPreviewTitleLeave}
                                />
                                <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                                  <MapPin aria-hidden className="size-3" />
                                  本地
                                </Badge>
                              </div>
                              <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
                                <code className="font-mono">{lp.path}</code>
                                <span aria-hidden>·</span>
                                <span>
                                  模版 <span className="font-mono">{lp.template_name}</span>
                                </span>
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-1 self-center">
                              <Button
                                size="sm"
                                variant="outline"
                                type="button"
                                className="gap-1"
                                onClick={() => openAddLocalFromContext(lp.path)}
                              >
                                <Plus aria-hidden className="size-3.5" />
                                添加本地页面
                              </Button>
                              <div className="relative inline-flex">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  type="button"
                                  onClick={() => openSettingsWithBaseline(`local:${lp.localKey}`)}
                                >
                                  设置
                                </Button>
                                {localSettingsDirtyByKey[lp.localKey] ? (
                                  <span
                                    className="bg-destructive ring-card absolute -end-0.5 -top-0.5 size-2 rounded-full ring-2"
                                    aria-hidden
                                  />
                                ) : null}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                type="button"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleteLocalKey(lp.localKey)}
                              >
                                <Trash2 aria-hidden className="size-3.5" />
                                删除
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground border-border/60 rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                        暂无本地页面。请在上方远端页面（或已有本地页）行右侧点击「添加本地页面」。
                      </p>
                    )}
                  </section>
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="border-border bg-card/95 supports-backdrop-filter:bg-card/80 shrink-0 border-t p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm dark:shadow-[0_-4px_12px_rgba(0,0,0,0.25)]">
            <Field className="gap-3">
              <div className="flex w-full flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="relative flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                    <p className="text-foreground shrink-0 text-sm font-medium leading-snug">同步模版到预览</p>
                    <Popover
                      open={blockedPreviewHintOpen && !canOpenPathPreview}
                      onOpenChange={(next) => {
                        if (!next) {
                          clearBlockedPreviewHintTimer()
                          setBlockedPreviewHintOpen(false)
                        }
                      }}
                      modal={false}
                    >
                      <PopoverPopup
                        side="top"
                        sideOffset={8}
                        align="center"
                        anchor={previewSyncSwitchWrapRef}
                        tooltipStyle
                        className="pointer-events-auto z-50 max-w-[min(18rem,calc(100vw-3rem))] text-balance text-center shadow-md"
                        onPointerEnter={onBlockedPreviewHintHoverEnter}
                        onPointerLeave={onBlockedPreviewHintHoverLeave}
                      >
                        <div className="relative pb-0.5 text-center">
                          <p className="text-xs leading-snug">
                            开启「同步模版到预览」后，即可点击页面标题在新标签页预览 HTML 效果。
                          </p>
                          <span
                            aria-hidden
                            className="border-t-popover mx-auto mt-1.5 block w-0 border-x-[7px] border-x-transparent border-t-[8px] border-solid"
                          />
                        </div>
                      </PopoverPopup>
                    </Popover>
                    <div
                      ref={previewSyncSwitchWrapRef}
                      className="inline-flex shrink-0 rounded-lg px-1 py-0.5"
                      onAnimationEnd={(e) => {
                        if (e.animationName.includes("preview-sync-nudge")) {
                          e.currentTarget.classList.remove("animate-preview-sync-nudge")
                        }
                      }}
                    >
                      <PreviewSyncLabeledSwitch
                        switchId={previewSyncSwitchDomId}
                        checked={Boolean(previewSnap?.enabled)}
                        disabled={previewToggleBusy}
                        onChange={(next) => void setPreviewSyncEnabled(next)}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">语言</span>
                      <Select
                        items={previewLocaleItems}
                        value={previewLocale}
                        onValueChange={(v) => {
                          if (v != null) setPreviewLocale(v)
                        }}
                        disabled={
                          Boolean(previewSnap?.enabled) &&
                          (previewSnap?.status === "starting" ||
                            previewSnap?.status === "syncing" ||
                            previewSnap?.status === "stopping")
                        }
                      >
                        <SelectTrigger size="sm" className="h-8 w-[min(100%,10rem)] min-w-[7.5rem]">
                          <SelectValue placeholder="语言" />
                        </SelectTrigger>
                        <SelectPopup>
                          {previewLocaleItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 px-2 text-xs"
                      disabled={!devMeta?.manualSyncTemplatePaths?.length}
                      onClick={() => openSyncFilesDialog()}
                      title={
                        syncFilesIsAutoUi
                          ? `按入口依赖自动选择（当前约 ${previewAutoLiquidPaths.length || "—"} 个 Liquid）`
                          : `手动勾选 ${previewSyncManualPaths.length} 个模板文件`
                      }
                    >
                      {syncFilesIsAutoUi ? "自动" : `${previewSyncManualPaths.length} 项`}
                      <span className="text-muted-foreground">·</span>
                      {syncFilesIsAutoUi
                        ? `${previewAutoLiquidPaths.length > 0 ? previewAutoLiquidPaths.length : "—"} 模板`
                        : `${previewSnap?.lastSyncedFileCount ?? 0} 文件`}
                    </Button>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs leading-snug">
                  开启：创建预览会话、上传主题并开始监听目录；关闭：删除会话并停止监听。
                  {previewSnap?.sessionPreview ? (
                    <span className="text-muted-foreground ms-1 font-mono text-[10px]">
                      session {previewSnap.sessionPreview}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="border-border bg-muted/30 w-full overflow-hidden rounded-md border">
                <div className="text-muted-foreground flex flex-col gap-2 border-b px-2 py-1.5 text-[10px] uppercase sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <span className="leading-snug">
                    访问与同步日志（按时间线合并；近底部 {LOG_SCROLL_BOTTOM_PX}px 内、有新行时自动滚到底）
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 normal-case">
                    {PREVIEW_LOG_FILTER_OPTIONS.map(({ value, label }) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={previewLogFilter === value ? "default" : "outline"}
                        className="h-7 px-2 text-[10px]"
                        onClick={() => setPreviewLogFilter(value)}
                      >
                        {label}
                      </Button>
                    ))}
                    {previewSnap?.status ? (
                      <span className="text-muted-foreground ms-1 font-mono text-[10px]">{previewSnap.status}</span>
                    ) : null}
                  </div>
                </div>
                <div
                  ref={previewLogScrollRef}
                  className="h-40 max-h-[40vh] w-full overflow-y-auto overflow-x-hidden"
                  onScroll={onPreviewLogsScroll}
                >
                  <pre className="text-foreground p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all">
                    {previewLogTimeline.length ? previewLogTimeline.join("\n") : previewLogEmptyHint}
                  </pre>
                </div>
              </div>
            </Field>
          </div>
        </div>
      </main>

      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (!o) {
            setAddOpen(false)
            setAddContextPath(null)
          }
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加本地页面</DialogTitle>
            <DialogDescription>仅在开发服务内存中生效，不会写回 Baklib。</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            {addContextPath ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                自页面路径 <code className="bg-muted rounded px-1 font-mono">{addContextPath}</code>{" "}
                发起添加；下方 slug 仍请填写完整路径片段（与是否挂在该路径下无关，仅作记录参考）。
              </p>
            ) : null}
            <Field>
              <FieldLabel>Slug</FieldLabel>
              <Input value={addSlug} onChange={(e) => setAddSlug(e.target.value)} placeholder="about 或 /about" />
              <FieldDescription>将规范为以 / 开头的路径。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>模版</FieldLabel>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={addTemplate}
                onChange={(e) => setAddTemplate(e.target.value)}
              >
                {(devMeta?.templateBasenames?.length ? devMeta.templateBasenames : ["page", "index"]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <FieldDescription>对应 templates/&lt;名称&gt;.liquid</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>页面标题</FieldLabel>
              <Input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="默认同 slug"
              />
            </Field>
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAddOpen(false)
                setAddContextPath(null)
              }}
            >
              取消
            </Button>
            <Button type="button" onClick={submitAddLocal}>
              添加
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <AlertDialog
        open={deleteLocalKey != null}
        onOpenChange={(o) => {
          if (!o) setDeleteLocalKey(null)
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>删除本地页面？</AlertDialogTitle>
            <AlertDialogDescription>
              将移除该本地页面及其已保存的 JSON 参数，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" type="button" />}>取消</AlertDialogClose>
            <Button type="button" variant="destructive" onClick={confirmDeleteLocal}>
              删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      <Dialog
        open={settingsOpen != null}
        onOpenChange={(o) => {
          if (!o) setSettingsOpen(null)
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>页面设置</DialogTitle>
            <DialogDescription>
              {settingsOpen?.startsWith("remote:") ? (
                <>
                  远端页面：模版与 JSON 仅保存在本机开发态，预览会按开发态合并；不会写回 Baklib 库。
                </>
              ) : (
                "本地页面：模版与 JSON 将随开发态一并保存。"
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <Field>
              <FieldLabel className="inline-flex flex-wrap items-center gap-1.5">
                模版
                {settingsPanelDirty.template ? (
                  <span
                    className="bg-destructive ring-background inline-block size-2 shrink-0 rounded-full ring-2"
                    aria-label="相对原始模版已修改"
                  />
                ) : null}
              </FieldLabel>
              <Select
                items={settingsTemplateItems}
                value={settingsTemplateSelectValue}
                onValueChange={(v) => {
                  if (v != null) setSettingsTemplateDraft(v)
                }}
              >
                <SelectTrigger size="sm" className="w-full min-w-0 font-mono text-xs">
                  <SelectValue placeholder="选择模版" />
                </SelectTrigger>
                <SelectPopup>
                  <SelectLabel className="px-2 py-1.5">templates/*.liquid</SelectLabel>
                  {settingsTemplateItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      <span className="flex w-full min-w-0 items-center justify-between gap-2">
                        <span className="truncate font-mono">{item.label}</span>
                        {settingsListOriginalTemplate != null && item.value === settingsListOriginalTemplate ? (
                          <span className="text-muted-foreground shrink-0 text-[10px]">原始</span>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <FieldDescription>对应主题目录中 templates 下的入口模版文件名（不含 .liquid）。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel className="inline-flex flex-wrap items-center gap-1.5">
                页面参数（JSON）
                {settingsPanelDirty.params ? (
                  <span
                    className="bg-destructive ring-background inline-block size-2 shrink-0 rounded-full ring-2"
                    aria-label="相对原始参数已修改"
                  />
                ) : null}
              </FieldLabel>
              <Textarea
                value={settingsDraft}
                onChange={(e) => setSettingsDraft(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
            </Field>
          </DialogPanel>
          <DialogFooter className="flex-wrap gap-2 sm:justify-end">
            {settingsOpen?.startsWith("remote:") ? (
              <Button type="button" variant="outline" className="me-auto" onClick={resetOpenRemoteSettings}>
                重置为打开弹窗时的远端基线
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => setSettingsOpen(null)}>
              取消
            </Button>
            <Button type="button" onClick={saveSettings}>
              保存
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={syncPickerOpen}
        onOpenChange={(o) => {
          if (!o) setSyncPickerOpen(false)
        }}
      >
        <DialogPopup className="flex max-h-[85vh] min-h-0 max-w-lg flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>选择要同步的模板文件</DialogTitle>
            <DialogDescription>
              打开时默认勾选<strong>与自动同步相同</strong>的入口依赖模板。若勾选结果与自动集合<strong>完全一致</strong>，或<strong>全部清空</strong>后保存，则仍为「自动」模式；任意增删即「手动」。仅 snippets / templates / layout / layouts / statics 下的
              .liquid；手动勾选最多 {maxManualLiquidSlots} 个（单次 API 上限 {devMeta?.maxPreviewSyncFiles ?? 20}，需为语言包与 config 预留约 3
              个名额）。
            </DialogDescription>
          </DialogHeader>
          <div
            data-slot="dialog-panel"
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 pt-1 pb-2"
          >
            <div className="shrink-0 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={syncPickerLoading || previewAutoLiquidPaths.length === 0}
                onClick={() => setSyncPickerDraft([...previewAutoLiquidPaths])}
              >
                恢复自动勾选
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={syncPickerLoading} onClick={() => setSyncPickerDraft([])}>
                清空（改回自动）
              </Button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
              {syncPickerLoading ? (
                <p className="text-muted-foreground py-10 text-center text-sm">正在计算入口依赖…</p>
              ) : (
                <ManualSyncPathTree
                  paths={devMeta?.manualSyncTemplatePaths ?? []}
                  selected={syncPickerDraft}
                  maxSelectable={maxManualLiquidSlots}
                  onSelectedChange={setSyncPickerDraft}
                  onHitCap={onSyncTreeHitCap}
                />
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="ghost" onClick={() => setSyncPickerOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={syncPickerLoading} onClick={saveSyncFilesDialog}>
              保存
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  )
}

/** COSS comp-180：两侧「关闭 / 开启」文案 + 中间 Switch */
function PreviewSyncLabeledSwitch({
  switchId,
  checked,
  disabled,
  onChange,
}: {
  switchId: string
  checked: boolean
  disabled: boolean
  onChange: (next: boolean) => void
}) {
  const offId = `${switchId}-off`
  const onId = `${switchId}-on`

  const setOff = () => {
    if (disabled) return
    void onChange(false)
  }
  const setOn = () => {
    if (disabled) return
    void onChange(true)
  }

  return (
    <div
      className={cn("group inline-flex shrink-0 items-center gap-2", disabled && "opacity-64")}
      data-state={checked ? "checked" : "unchecked"}
    >
      <span
        id={offId}
        aria-controls={switchId}
        className="group-data-[state=checked]:text-muted-foreground/70 flex-1 cursor-pointer text-right text-sm font-medium select-none sm:text-xs"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled ? true : undefined}
        onClick={setOff}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setOff()
          }
        }}
      >
        关闭
      </span>
      <Switch
        id={switchId}
        aria-labelledby={`${offId} ${onId}`}
        checked={checked}
        disabled={disabled}
        className={cn(
          "shrink-0",
          "data-checked:border-success data-checked:bg-success data-checked:shadow-sm",
          "[&_[data-slot=switch-thumb]]:data-checked:border-white/25 dark:[&_[data-slot=switch-thumb]]:data-checked:border-emerald-950/30",
        )}
        onCheckedChange={(next) => {
          if (!disabled) void onChange(Boolean(next))
        }}
      />
      <span
        id={onId}
        aria-controls={switchId}
        className="group-data-[state=unchecked]:text-muted-foreground/70 group-data-[state=checked]:text-success flex-1 cursor-pointer text-left text-sm font-medium select-none sm:text-xs"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled ? true : undefined}
        onClick={setOn}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setOn()
          }
        }}
      >
        开启
      </span>
    </div>
  )
}

function PageTreeNode({
  node,
  depth,
  canOpenPathPreview,
  onBlockedPreviewTitleEnter,
  onBlockedPreviewTitleLeave,
  onSettings,
  onAddLocal,
  remotePathOverrides,
  remoteDirtyById,
}: {
  node: RemotePage
  depth: number
  canOpenPathPreview: boolean
  onBlockedPreviewTitleEnter?: () => void
  onBlockedPreviewTitleLeave?: () => void
  onSettings: (k: string) => void
  onAddLocal: (contextPath: string) => void
  remotePathOverrides: Record<string, { template_name?: string }>
  remoteDirtyById: Record<string, boolean>
}) {
  const children = node.children && node.children.length > 0 ? node.children : null
  const [open, setOpen] = useState(depth < 2)
  const pathNorm = normalizePath(node.path)
  const rawTemplate = remotePathOverrides[pathNorm]?.template_name ?? node.template_name
  const displayTemplate =
    typeof rawTemplate === "string" && rawTemplate.trim() ? rawTemplate.trim() : "page"

  const row = (
    <div className="border-border/80 hover:bg-muted/35 flex min-w-0 flex-1 flex-wrap items-start gap-2 rounded-lg border border-transparent px-2 py-2 transition-colors sm:flex-nowrap">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <PageTitleButton
            name={node.name}
            path={node.path}
            canOpenPathPreview={canOpenPathPreview}
            onBlockedPreviewTitleEnter={onBlockedPreviewTitleEnter}
            onBlockedPreviewTitleLeave={onBlockedPreviewTitleLeave}
          />
          <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
            <Globe aria-hidden className="size-3" />
            远端
          </Badge>
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
          <code className="font-mono">{node.path}</code>
          <span aria-hidden>·</span>
          <span>
            模版 <span className="font-mono">{displayTemplate}</span>
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1 self-center">
        <Button
          size="sm"
          variant="outline"
          type="button"
          className="gap-1"
          onClick={() => onAddLocal(node.path)}
        >
          <Plus aria-hidden className="size-3.5" />
          添加本地页面
        </Button>
        <div className="relative inline-flex">
          <Button size="sm" variant="ghost" type="button" onClick={() => onSettings(`remote:${node.id}`)}>
            设置
          </Button>
          {remoteDirtyById[node.id] ? (
            <span
              className="bg-destructive ring-card absolute -end-0.5 -top-0.5 size-2 rounded-full ring-2"
              aria-hidden
            />
          ) : null}
        </div>
      </div>
    </div>
  )

  if (!children) {
    return (
      <li className="select-none" role="treeitem" aria-expanded={false}>
        <div className="flex gap-1 ps-1" style={{ paddingInlineStart: depth * 12 }}>
          <span className="inline-flex w-8 shrink-0" aria-hidden />
          {row}
        </div>
      </li>
    )
  }

  return (
    <li className="select-none" role="treeitem" aria-expanded={open}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex gap-1 ps-1" style={{ paddingInlineStart: depth * 12 }}>
          <CollapsibleTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                type="button"
                className="text-muted-foreground mt-0.5 shrink-0"
                aria-label={open ? "折叠子页面" : "展开子页面"}
              />
            }
          >
            {open ? (
              <ChevronDown aria-hidden className="size-4" />
            ) : (
              <ChevronRight aria-hidden className="size-4" />
            )}
          </CollapsibleTrigger>
          {row}
        </div>
        <CollapsiblePanel>
          <ul className="border-border/60 ms-4 border-s ps-1 pt-0.5" role="group">
            {children.map((ch) => (
              <PageTreeNode
                key={ch.id}
                node={ch}
                depth={depth + 1}
                canOpenPathPreview={canOpenPathPreview}
                onBlockedPreviewTitleEnter={onBlockedPreviewTitleEnter}
                onBlockedPreviewTitleLeave={onBlockedPreviewTitleLeave}
                onSettings={onSettings}
                onAddLocal={onAddLocal}
                remotePathOverrides={remotePathOverrides}
                remoteDirtyById={remoteDirtyById}
              />
            ))}
          </ul>
        </CollapsiblePanel>
      </Collapsible>
    </li>
  )
}
