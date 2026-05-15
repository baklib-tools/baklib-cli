"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight, FileIcon, FolderIcon, FolderOpenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible"

type FileNode = { kind: "file"; segment: string; path: string }
type DirNode = { kind: "dir"; segment: string; pathPrefix: string; children: TreeNode[] }
type TreeNode = FileNode | DirNode

function insertPath(root: DirNode, fullPath: string) {
  const parts = fullPath.split("/").filter(Boolean)
  if (parts.length === 0) return
  let cur = root
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]!
    const isLast = i === parts.length - 1
    if (isLast && seg.endsWith(".liquid")) {
      cur.children.push({ kind: "file", segment: seg, path: fullPath })
      return
    }
    let next = cur.children.find(
      (c): c is DirNode => c.kind === "dir" && c.segment === seg,
    )
    if (!next) {
      const pathPrefix = cur.pathPrefix ? `${cur.pathPrefix}/${seg}` : seg
      next = { kind: "dir", segment: seg, pathPrefix, children: [] }
      cur.children.push(next)
    }
    cur = next
  }
}

function sortTreeNodes(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1
    return a.segment.localeCompare(b.segment)
  })
  for (const n of nodes) {
    if (n.kind === "dir") sortTreeNodes(n.children)
  }
}

function buildTree(paths: string[]): DirNode {
  const root: DirNode = { kind: "dir", segment: "", pathPrefix: "", children: [] }
  const sorted = [...paths].sort()
  for (const p of sorted) insertPath(root, p)
  sortTreeNodes(root.children)
  return root
}

function collectFilePaths(node: DirNode): string[] {
  const out: string[] = []
  for (const c of node.children) {
    if (c.kind === "file") out.push(c.path)
    else out.push(...collectFilePaths(c))
  }
  return out
}

function allDirPrefixes(node: DirNode): string[] {
  const out: string[] = []
  for (const c of node.children) {
    if (c.kind === "dir") {
      out.push(c.pathPrefix, ...allDirPrefixes(c))
    }
  }
  return out
}

const INDENT_PX = 14

export type ManualSyncPathTreeProps = {
  paths: string[]
  selected: string[]
  maxSelectable: number
  onSelectedChange: (next: string[]) => void
  /** 因总数上限未能全选文件夹下全部文件时触发 */
  onHitCap?: () => void
}

export function ManualSyncPathTree({
  paths,
  selected,
  maxSelectable,
  onSelectedChange,
  onHitCap,
}: ManualSyncPathTreeProps) {
  const root = useMemo(() => buildTree(paths), [paths])
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const dirIds = useMemo(() => allDirPrefixes(root), [root])
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev }
      for (const id of dirIds) {
        if (next[id] === undefined) next[id] = true
      }
      return next
    })
  }, [dirIds])

  const toggleDirOpen = (id: string, o: boolean) => {
    setOpenMap((m) => ({ ...m, [id]: o }))
  }

  const applyFolderCheck = (node: DirNode, wantChecked: boolean) => {
    const under = collectFilePaths(node)
    if (under.length === 0) return

    if (!wantChecked) {
      const rm = new Set(under)
      onSelectedChange(selected.filter((p) => !rm.has(p)))
      return
    }

    const set = new Set(selected)
    const toAdd = under.filter((p) => !set.has(p))
    let room = Math.max(0, maxSelectable - set.size)
    let capped = false
    for (const p of toAdd) {
      if (room <= 0) {
        capped = true
        break
      }
      set.add(p)
      room--
    }
    onSelectedChange([...set])
    if (capped) onHitCap?.()
  }

  const toggleFile = (path: string, checked: boolean) => {
    if (checked) {
      if (selected.length >= maxSelectable && !selectedSet.has(path)) {
        onHitCap?.()
        return
      }
      if (!selectedSet.has(path)) onSelectedChange([...selected, path])
    } else {
      onSelectedChange(selected.filter((p) => p !== path))
    }
  }

  const renderFile = (file: FileNode, depth: number) => (
    <div
      className="hover:bg-muted/40 flex min-w-0 items-center gap-1.5 rounded-md py-0.5 pe-1"
      style={{ paddingInlineStart: depth * INDENT_PX }}
    >
      <span className="inline-flex w-6 shrink-0" aria-hidden />
      <Checkbox
        checked={selectedSet.has(file.path)}
        onCheckedChange={(c) => toggleFile(file.path, Boolean(c))}
        className="shrink-0"
      />
      <FileIcon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
      <span className="text-muted-foreground font-mono text-[11px] leading-snug break-all">
        {file.segment}
      </span>
    </div>
  )

  const renderDir = (node: DirNode, depth: number): ReactNode => {
    if (!node.children.length) return null

    if (node.pathPrefix === "") {
      return (
        <ul className="space-y-0.5">
          {node.children.map((ch) => (
            <li key={ch.kind === "file" ? ch.path : ch.pathPrefix} className="select-none">
              {ch.kind === "file" ? renderFile(ch, depth) : renderDir(ch, depth)}
            </li>
          ))}
        </ul>
      )
    }

    const under = collectFilePaths(node)
    const nSel = under.filter((p) => selectedSet.has(p)).length
    const allChecked = under.length > 0 && nSel === under.length
    const indeterminate = nSel > 0 && nSel < under.length
    const open = openMap[node.pathPrefix] ?? true

    return (
      <div
        className="hover:bg-muted/40 flex min-w-0 flex-col rounded-md py-0.5 pe-1"
        style={{ paddingInlineStart: depth * INDENT_PX }}
      >
        <Collapsible
          open={open}
          onOpenChange={(o) => toggleDirOpen(node.pathPrefix, o)}
          className="min-w-0"
        >
          <div className="flex min-w-0 items-center gap-0.5">
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="text-muted-foreground size-7 shrink-0 sm:size-6"
                  aria-label={open ? "折叠" : "展开"}
                />
              }
            >
              {open ? (
                <ChevronDown aria-hidden className="size-3.5" />
              ) : (
                <ChevronRight aria-hidden className="size-3.5" />
              )}
            </CollapsibleTrigger>
            {under.length > 0 ? (
              <Checkbox
                checked={allChecked}
                indeterminate={indeterminate}
                onCheckedChange={(c) => applyFolderCheck(node, Boolean(c))}
                className="shrink-0"
              />
            ) : (
              <span className="inline-flex w-4.5 shrink-0" aria-hidden />
            )}
            {open ? (
              <FolderOpenIcon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
            ) : (
              <FolderIcon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
            )}
            <span className="text-foreground truncate text-xs font-medium">{node.segment}</span>
          </div>
          <CollapsiblePanel>
            <ul
              className="border-border/60 relative ms-2.5 border-s ps-1.5 pt-0.5"
              role="group"
            >
              {node.children.map((ch) => (
                <li key={ch.kind === "file" ? ch.path : ch.pathPrefix} className="select-none">
                  {ch.kind === "file" ? renderFile(ch, depth + 1) : renderDir(ch, depth + 1)}
                </li>
              ))}
            </ul>
          </CollapsiblePanel>
        </Collapsible>
      </div>
    )
  }

  if (!paths.length) {
    return <p className="text-muted-foreground text-xs">暂无可选手动同步的模板路径。</p>
  }

  return <div className="min-h-0 pe-1">{renderDir(root, 0)}</div>
}
