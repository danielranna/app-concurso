"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FolderPlus,
  RefreshCw,
  Trash2,
} from "lucide-react"
import type { NotebookIndexPreview } from "@/lib/tec-notebook-index-import"
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

function flattenTreeNodes(nodes: TecSubjectNode[]): TecSubjectNode[] {
  const out: TecSubjectNode[] = []
  function walk(list: TecSubjectNode[]) {
    for (const n of list) {
      out.push(n)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
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
  const [deleting, setDeleting] = useState(false)
  const [folderName, setFolderName] = useState("")
  const [newFolderParentId, setNewFolderParentId] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkTargetId, setBulkTargetId] = useState("")
  const [foldersOpen, setFoldersOpen] = useState(false)
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "err" } | null>(null)
  const [indexPreview, setIndexPreview] = useState<NotebookIndexPreview | null>(null)
  const [indexImporting, setIndexImporting] = useState(false)
  const [indexApplying, setIndexApplying] = useState(false)
  const [syncBeforeIndex, setSyncBeforeIndex] = useState(true)
  const [confirmedMatchIds, setConfirmedMatchIds] = useState<Set<string>>(new Set())
  const [matchesOpen, setMatchesOpen] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ungroupedRef = useRef<HTMLDivElement>(null)

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
    setIndexPreview(null)
    setConfirmedMatchIds(new Set())
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

  const selectedTopicNodes = useMemo(() => {
    if (!tree || selectedIds.size === 0) return []
    const all = [...flattenTreeNodes(tree.nodes), ...tree.ungrouped]
    return all.filter((n) => selectedIds.has(n.id) && n.node_type === "topic")
  }, [tree, selectedIds])

  const selectedQuestionTotal = useMemo(
    () => selectedTopicNodes.reduce((sum, n) => sum + n.question_count, 0),
    [selectedTopicNodes]
  )

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

  async function uploadIndexExcel(files: FileList | File[]) {
    if (!selected) return
    const list = [...files]
    if (list.length === 0) return

    setIndexImporting(true)
    setMessage(null)
    const fd = new FormData()
    fd.append("user_id", userId)
    fd.append("tec_subject", selected)
    fd.append("action", "preview")
    for (const file of list) fd.append("file", file)
    if (syncBeforeIndex) fd.append("sync_first", "1")

    const res = await fetch("/api/questions/tec-tree/import-index", {
      method: "POST",
      body: fd,
    })
    const data = await res.json()
    setIndexImporting(false)

    if (!res.ok) {
      setMessage({ text: data.error ?? "Falha ao ler Excel", tone: "err" })
      return
    }

    const preview = data as NotebookIndexPreview
    setIndexPreview(preview)
    setConfirmedMatchIds(
      new Set(preview.matches.filter((m) => m.default_confirmed).map((m) => m.db_node_id))
    )
    if (syncBeforeIndex) await reloadTree(true)
  }

  function toggleMatchConfirm(dbNodeId: string, checked: boolean) {
    setConfirmedMatchIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(dbNodeId)
      else next.delete(dbNodeId)
      return next
    })
  }

  async function applyIndexHierarchy() {
    if (!selected || !indexPreview) return
    setIndexApplying(true)
    const fd = new FormData()
    fd.append("user_id", userId)
    fd.append("tec_subject", selected)
    fd.append("action", "apply")
    fd.append("preview", JSON.stringify(indexPreview))
    fd.append("confirmed_node_ids", JSON.stringify([...confirmedMatchIds]))

    const res = await fetch("/api/questions/tec-tree/import-index", {
      method: "POST",
      body: fd,
    })
    const data = await res.json()
    setIndexApplying(false)

    if (!res.ok) {
      setMessage({ text: data.error ?? "Falha ao aplicar hierarquia", tone: "err" })
      return
    }

    setIndexPreview(null)
    setConfirmedMatchIds(new Set())
    setTree(data.tree ?? null)
    setFoldersOpen(true)
    setMessage({
      text: `Hierarquia aplicada: ${data.folders_created ?? 0} pasta(s) criada(s), ${data.topics_moved ?? 0} assunto(s) movido(s). Ajuste o residual abaixo.`,
      tone: "ok",
    })
    await reloadSummaries()
    setTimeout(() => ungroupedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100)
  }

  async function deleteSelectedTopics() {
    if (!selected || selectedTopicNodes.length === 0) return

    const preview = selectedTopicNodes
      .slice(0, 3)
      .map((n) => n.name)
      .join("\n• ")
    const more =
      selectedTopicNodes.length > 3
        ? `\n… e mais ${selectedTopicNodes.length - 3} assunto(s)`
        : ""

    const ok = window.confirm(
      `Apagar ${selectedQuestionTotal} questão(ões) do banco global e remover ${selectedTopicNodes.length} assunto(s)?\n\n` +
        `• ${preview}${more}\n\n` +
        "Isso remove as questões de todos os cadernos. Não dá para desfazer."
    )
    if (!ok) return

    setDeleting(true)
    const res = await fetch("/api/questions/tec-tree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        action: "delete_topic_questions",
        tec_subject: selected,
        node_ids: selectedTopicNodes.map((n) => n.id),
      }),
    })
    const data = await res.json()
    setDeleting(false)

    if (!res.ok) {
      setMessage({ text: data.error ?? "Erro ao apagar", tone: "err" })
      return
    }

    setTree(data.tree ?? null)
    setSelectedIds(new Set())
    const skipped = (data.skipped_folder_ids as string[] | undefined)?.length ?? 0
    setMessage({
      text:
        skipped > 0
          ? `${data.questions_deleted ?? 0} questão(ões) apagada(s), ${data.nodes_deleted ?? 0} assunto(s) removido(s). ${skipped} pasta(s) ignorada(s).`
          : `${data.questions_deleted ?? 0} questão(ões) apagada(s), ${data.nodes_deleted ?? 0} assunto(s) removido(s).`,
      tone: "ok",
    })
    await reloadSummaries()
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
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files
                  if (picked?.length) uploadIndexExcel(picked)
                  e.target.value = ""
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={indexImporting}
                className="inline-flex items-center gap-1 rounded border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs text-violet-900"
                title="Selecione um ou mais Excel (ex.: TI pt1, pt2, pt3)"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {indexImporting ? "Lendo Excel…" : "Importar índice(s) Excel"}
              </button>
              <label className="flex items-center gap-1 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={syncBeforeIndex}
                  onChange={(e) => setSyncBeforeIndex(e.target.checked)}
                />
                Sincronizar banco antes
              </label>
            </div>

            {indexPreview && (
              <div className="mb-4 space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-violet-950">Prévia do índice Excel</p>
                    <p className="text-xs text-violet-800/80">
                      {indexPreview.excel_subject_label}
                      {indexPreview.part_count > 1 &&
                        ` · ${indexPreview.part_count} arquivo(s)`}{" "}
                      · {indexPreview.stats.folder_count} pasta(s) ·{" "}
                      {indexPreview.stats.matched_count} pareamento(s) ·{" "}
                      {indexPreview.stats.unmatched_db_count} residual(is) no banco
                    </p>
                    {indexPreview.source_files?.length > 0 && (
                      <p className="mt-1 text-[11px] text-violet-700/90">
                        Arquivos: {indexPreview.source_files.join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIndexPreview(null)}
                      className="rounded border bg-white px-3 py-1.5 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={applyIndexHierarchy}
                      disabled={indexApplying || confirmedMatchIds.size === 0}
                      className="rounded bg-violet-700 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    >
                      {indexApplying ? "Aplicando…" : "Aplicar hierarquia"}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMatchesOpen(!matchesOpen)}
                  className="flex items-center gap-1 text-xs font-medium text-violet-900"
                >
                  {matchesOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  Pareamentos ({confirmedMatchIds.size}/{indexPreview.matches.length} confirmados)
                </button>
                {matchesOpen && (
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded border bg-white p-2 text-xs">
                    {indexPreview.matches.map((m) => (
                      <li key={m.excel_path} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={confirmedMatchIds.has(m.db_node_id)}
                          onChange={(e) => toggleMatchConfirm(m.db_node_id, e.target.checked)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-slate-700">{m.excel_name}</span>
                          <span className="text-slate-400"> → </span>
                          <span className="text-slate-900">{m.db_tec_topic}</span>
                          <span className="ml-1 text-slate-400">({m.score}%)</span>
                          {!m.default_confirmed && (
                            <span className="ml-1 text-amber-700">sugestão</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {indexPreview.unmatched_excel.length > 0 && (
                  <div className="rounded border border-amber-200 bg-amber-50/80 p-2 text-xs">
                    <p className="font-medium text-amber-900">
                      Excel sem par no banco ({indexPreview.unmatched_excel.length})
                    </p>
                    <p className="mt-1 line-clamp-3 text-amber-800">
                      {indexPreview.unmatched_excel.map((u) => u.name).join(" · ")}
                    </p>
                  </div>
                )}

                {indexPreview.unmatched_db.length > 0 && (
                  <div className="rounded border border-slate-200 bg-white p-2 text-xs">
                    <p className="font-medium text-slate-800">
                      Residual no banco ({indexPreview.unmatched_db.length}) — organize manualmente
                      após aplicar
                    </p>
                    <p className="mt-1 line-clamp-3 text-slate-600">
                      {indexPreview.unmatched_db.map((u) => u.tec_topic).join(" · ")}
                    </p>
                  </div>
                )}
              </div>
            )}
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
                Marque assuntos inválidos (parse errado) e use Apagar questões. Para organizar,
                escolha o destino e clique em Mover.
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
                {selectedTopicNodes.length > 0 && (
                  <button
                    type="button"
                    onClick={deleteSelectedTopics}
                    disabled={deleting}
                    className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-800 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleting
                      ? "Apagando…"
                      : `Apagar questões (${selectedQuestionTotal})`}
                  </button>
                )}
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
                  <div ref={ungroupedRef} className="mb-4">
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
