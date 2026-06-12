"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, FolderPlus, RefreshCw } from "lucide-react"
import type { TecSubjectNode, TecSubjectSummary } from "@/lib/tec-subject-tree-types"

type FolderOption = {
  id: string
  name: string
  depth: number
}

function listFolderOptions(
  nodes: TecSubjectNode[],
  excludeIds: Set<string> = new Set(),
  depth = 0
): FolderOption[] {
  const out: FolderOption[] = []
  for (const n of nodes) {
    if (n.node_type !== "folder" || excludeIds.has(n.id)) continue
    out.push({ id: n.id, name: n.name, depth })
    if (n.children?.length) {
      out.push(...listFolderOptions(n.children, excludeIds, depth + 1))
    }
  }
  return out
}

function collectSubtreeIds(node: TecSubjectNode): Set<string> {
  const ids = new Set<string>([node.id])
  for (const child of node.children ?? []) {
    collectSubtreeIds(child).forEach((id) => ids.add(id))
  }
  return ids
}

function findNodeById(nodes: TecSubjectNode[], id: string): TecSubjectNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children?.length) {
      const found = findNodeById(n.children, id)
      if (found) return found
    }
  }
  return null
}

function folderOptionLabel(option: FolderOption): string {
  const indent = option.depth > 0 ? `${"  ".repeat(option.depth)}↳ ` : ""
  return `${indent}${option.name}`
}

function bulkMoveExcludeIds(
  rootNodes: TecSubjectNode[],
  selectedIds: Set<string>
): Set<string> {
  const exclude = new Set<string>()
  function walk(nodes: TecSubjectNode[]) {
    for (const n of nodes) {
      if (n.node_type === "folder" && selectedIds.has(n.id)) {
        collectSubtreeIds(n).forEach((id) => exclude.add(id))
      }
      if (n.children?.length) walk(n.children)
    }
  }
  walk(rootNodes)
  return exclude
}

function ParentFolderSelect({
  value,
  onChange,
  options,
  includeUngrouped = false,
  className = "",
}: {
  value: string
  onChange: (parentId: string) => void
  options: FolderOption[]
  includeUngrouped?: boolean
  className?: string
}) {
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {includeUngrouped && <option value="">Sem pasta</option>}
      {!includeUngrouped && <option value="">Raiz da matéria</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {folderOptionLabel(o)}
        </option>
      ))}
    </select>
  )
}

function TecTreeNode({
  node,
  depth,
  selectedIds,
  onToggle,
  onCreateSubfolder,
  defaultOpen = false,
}: {
  node: TecSubjectNode
  depth: number
  selectedIds: Set<string>
  onToggle: (nodeId: string, checked: boolean) => void
  onCreateSubfolder: (parentId: string) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const isFolder = node.node_type === "folder"
  const checked = selectedIds.has(node.id)

  return (
    <div>
      <label
        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 ${
          checked ? "bg-blue-50/80" : ""
        }`}
        style={{ paddingLeft: depth * 14 + 8 }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(node.id, e.target.checked)}
          className="shrink-0"
        />
        {isFolder ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              setOpen(!open)
            }}
            className="shrink-0"
          >
            {open ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate" title={node.name}>
          {node.name}
        </span>
        <span className="shrink-0 text-xs text-slate-400">
          {node.question_count} ({node.percent?.toFixed(1) ?? 0}%)
        </span>
        {isFolder && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              onCreateSubfolder(node.id)
            }}
            className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-white"
            title="Criar subpasta"
          >
            + sub
          </button>
        )}
      </label>
      {isFolder && open && node.children?.map((c) => (
        <TecTreeNode
          key={c.id}
          node={c}
          depth={depth + 1}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onCreateSubfolder={onCreateSubfolder}
          defaultOpen={false}
        />
      ))}
    </div>
  )
}

export default function TecOrganizePanel({ userId }: { userId: string }) {
  const [summaries, setSummaries] = useState<TecSubjectSummary[]>([])
  const [selected, setSelected] = useState<string>("")
  const [tree, setTree] = useState<{
    nodes: TecSubjectNode[]
    ungrouped: TecSubjectNode[]
    total_questions: number
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [moving, setMoving] = useState(false)
  const [folderName, setFolderName] = useState("")
  const [newFolderParentId, setNewFolderParentId] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTargetId, setBulkTargetId] = useState("")
  const [foldersOpen, setFoldersOpen] = useState(false)
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "err" } | null>(null)

  const reloadSummaries = useCallback(async () => {
    const res = await fetch(`/api/questions/tec-tree?user_id=${userId}`)
    setSummaries(await res.json())
  }, [userId])

  const reloadTree = useCallback(async (silent = false) => {
    if (!selected) return
    if (!silent) setLoading(true)
    const res = await fetch(
      `/api/questions/tec-tree?user_id=${userId}&tec_subject=${encodeURIComponent(selected)}`
    )
    const data = await res.json()
    setTree(data)
    if (!silent) setLoading(false)
  }, [userId, selected])

  useEffect(() => {
    reloadSummaries()
  }, [reloadSummaries])

  useEffect(() => {
    setSelectedIds(new Set())
    setBulkTargetId("")
    reloadTree()
  }, [reloadTree])

  const folderOptions = useMemo(
    () => listFolderOptions(tree?.nodes ?? []),
    [tree?.nodes]
  )

  const bulkTargetOptions = useMemo(() => {
    if (!tree?.nodes.length) return folderOptions
    const exclude = bulkMoveExcludeIds(tree.nodes, selectedIds)
    return listFolderOptions(tree.nodes, exclude)
  }, [tree?.nodes, selectedIds, folderOptions])

  const newFolderParentName = useMemo(() => {
    if (!newFolderParentId || !tree?.nodes.length) return null
    return findNodeById(tree.nodes, newFolderParentId)?.name ?? null
  }, [newFolderParentId, tree?.nodes])

  function toggleNode(nodeId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(nodeId)
      else next.delete(nodeId)
      return next
    })
  }

  function selectAllUngrouped() {
    if (!tree?.ungrouped.length) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const n of tree.ungrouped) next.add(n.id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function seedTopics() {
    if (!selected) return
    setLoading(true)
    const res = await fetch("/api/questions/tec-tree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, action: "seed", tec_subject: selected }),
    })
    const data = await res.json()
    setMessage({
      text: `Importados ${data.created ?? 0} assuntos (${data.skipped ?? 0} já existiam).`,
      tone: "ok",
    })
    setTree(data.tree ?? null)
    setSelectedIds(new Set())
    await reloadSummaries()
    setLoading(false)
  }

  async function createFolder() {
    if (!selected || !folderName.trim()) return
    const res = await fetch("/api/questions/tec-tree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        action: "create_folder",
        tec_subject: selected,
        name: folderName.trim(),
        parent_id: newFolderParentId || null,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage({ text: data.error ?? "Erro ao criar pasta", tone: "err" })
      return
    }
    setFolderName("")
    setNewFolderParentId("")
    await reloadTree(true)
  }

  function startSubfolder(parentId: string) {
    setNewFolderParentId(parentId)
    setFoldersOpen(true)
    setMessage(null)
  }

  async function bulkMove() {
    if (selectedIds.size === 0) return
    setMoving(true)
    const res = await fetch("/api/questions/tec-tree", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        node_ids: [...selectedIds],
        parent_id: bulkTargetId || null,
      }),
    })
    const data = await res.json()
    setMoving(false)
    if (!res.ok) {
      setMessage({ text: data.error ?? "Erro ao mover itens", tone: "err" })
      return
    }
    const skipped = data.skipped ?? 0
    setMessage({
      text:
        skipped > 0
          ? `${data.moved ?? selectedIds.size} item(ns) movido(s). ${skipped} ignorado(s).`
          : `${data.moved ?? selectedIds.size} item(ns) movido(s).`,
      tone: "ok",
    })
    setSelectedIds(new Set())
    await reloadTree(true)
  }

  const selectedCount = selectedIds.size

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <ul className="max-h-[70vh] space-y-1 overflow-y-auto rounded-lg border p-2">
        {summaries.map((s) => (
          <li key={s.tec_subject}>
            <button
              type="button"
              onClick={() => setSelected(s.tec_subject)}
              className={`w-full rounded px-3 py-2 text-left text-sm ${
                selected === s.tec_subject ? "bg-blue-50 font-medium text-blue-800" : "hover:bg-slate-50"
              }`}
            >
              <p className="truncate">{s.tec_subject}</p>
              <p className="text-xs text-slate-400">
                {s.topic_count} assuntos · {s.total_questions} questões
                {s.has_tree ? " · organizada" : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>

      <div className="min-w-0">
        {!selected ? (
          <p className="text-sm text-slate-500">Selecione uma matéria TEC para organizar.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-blue-800">{selected}</h2>
              <button
                type="button"
                onClick={seedTopics}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Importar assuntos do banco
              </button>
            </div>
            {message && (
              <p
                className={`mb-3 rounded border px-3 py-2 text-sm ${
                  message.tone === "err"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-green-200 bg-green-50 text-green-800"
                }`}
              >
                {message.text}
              </p>
            )}
            <div className="mb-3 space-y-2 rounded-lg border bg-slate-50/80 p-3">
              <p className="text-xs text-slate-600">
                Marque os assuntos, escolha o destino e clique em Mover. Crie pastas abaixo; elas
                ficam recolhidas até você abrir.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder={
                    newFolderParentName
                      ? `Subpasta de “${newFolderParentName}”`
                      : "Nome da pasta (ex.: Orçamento Público)"
                  }
                  className="min-w-[12rem] flex-1 rounded border bg-white px-3 py-1.5 text-sm"
                />
                <ParentFolderSelect
                  value={newFolderParentId}
                  onChange={setNewFolderParentId}
                  options={folderOptions}
                  className="max-w-[12rem] rounded border bg-white px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={createFolder}
                  disabled={!folderName.trim()}
                  className="inline-flex items-center gap-1 rounded bg-slate-800 px-3 py-1.5 text-sm text-white"
                >
                  <FolderPlus className="h-4 w-4" /> Pasta
                </button>
              </div>
            </div>

            {selectedCount > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                <span className="text-sm font-medium text-blue-900">
                  {selectedCount} selecionado(s)
                </span>
                <ParentFolderSelect
                  value={bulkTargetId}
                  onChange={setBulkTargetId}
                  options={bulkTargetOptions}
                  includeUngrouped
                  className="min-w-[10rem] flex-1 rounded border bg-white px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={bulkMove}
                  disabled={moving}
                  className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {moving ? "Movendo…" : "Mover"}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded border bg-white px-3 py-1.5 text-sm"
                >
                  Limpar
                </button>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-slate-500">Carregando…</p>
            ) : !tree?.nodes.length && !tree?.ungrouped.length ? (
              <p className="text-sm text-slate-500">
                Clique em &quot;Importar assuntos do banco&quot; para começar.
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto rounded-lg border p-2">
                {tree?.ungrouped && tree.ungrouped.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-600">
                        Sem pasta ({tree.ungrouped.length})
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={selectAllUngrouped}
                          className="text-[11px] text-blue-700 hover:underline"
                        >
                          Selecionar todos
                        </button>
                        {selectedCount > 0 && (
                          <button
                            type="button"
                            onClick={clearSelection}
                            className="text-[11px] text-slate-500 hover:underline"
                          >
                            Limpar
                          </button>
                        )}
                      </div>
                    </div>
                    {tree.ungrouped.map((n) => (
                      <label
                        key={n.id}
                        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50 ${
                          selectedIds.has(n.id) ? "bg-blue-50/80" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(n.id)}
                          onChange={(e) => toggleNode(n.id, e.target.checked)}
                        />
                        <span className="min-w-0 flex-1 truncate" title={n.name}>
                          {n.name}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {n.question_count} ({n.percent?.toFixed(1) ?? 0}%)
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {tree && tree.nodes.length > 0 && (
                  <div className={tree.ungrouped.length > 0 ? "border-t pt-3" : ""}>
                    <button
                      type="button"
                      onClick={() => setFoldersOpen(!foldersOpen)}
                      className="mb-2 flex w-full items-center gap-1 text-left text-xs font-medium text-slate-600"
                    >
                      {foldersOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      Pastas ({tree.nodes.length} na raiz)
                    </button>
                    {foldersOpen &&
                      tree.nodes.map((n) => (
                        <TecTreeNode
                          key={n.id}
                          node={n}
                          depth={0}
                          selectedIds={selectedIds}
                          onToggle={toggleNode}
                          onCreateSubfolder={startSubfolder}
                          defaultOpen={false}
                        />
                      ))}
                  </div>
                )}
              </div>
            )}
            {tree && (
              <p className="mt-2 text-xs text-slate-400">
                Total matéria: {tree.total_questions} questões
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
