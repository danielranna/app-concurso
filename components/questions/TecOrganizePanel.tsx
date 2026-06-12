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

function ParentFolderSelect({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string
  onChange: (parentId: string) => void
  options: FolderOption[]
  className?: string
}) {
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Raiz da matéria</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {folderOptionLabel(o)}
        </option>
      ))}
    </select>
  )
}

function MoveToFolderSelect({
  node,
  rootNodes,
  onMove,
}: {
  node: TecSubjectNode
  rootNodes: TecSubjectNode[]
  onMove: (nodeId: string, parentId: string | null) => void
}) {
  const excludeIds =
    node.node_type === "folder" ? collectSubtreeIds(node) : new Set<string>()
  const options = listFolderOptions(rootNodes, excludeIds)

  return (
    <select
      className="ml-1 max-w-[9rem] truncate rounded border px-1 py-0.5 text-[10px]"
      value={node.parent_id ?? ""}
      onChange={(e) => onMove(node.id, e.target.value || null)}
      title="Mover para pasta"
    >
      <option value="">Sem pasta</option>
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
  rootNodes,
  onMove,
  onCreateSubfolder,
}: {
  node: TecSubjectNode
  depth: number
  rootNodes: TecSubjectNode[]
  onMove: (nodeId: string, parentId: string | null) => void
  onCreateSubfolder: (parentId: string) => void
}) {
  const [open, setOpen] = useState(true)
  const isFolder = node.node_type === "folder"

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
        style={{ paddingLeft: depth * 14 + 8 }}
      >
        {isFolder ? (
          <button type="button" onClick={() => setOpen(!open)} className="shrink-0">
            {open ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0 text-slate-300">•</span>
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
            onClick={() => onCreateSubfolder(node.id)}
            className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-slate-600 hover:bg-white"
            title="Criar subpasta"
          >
            + sub
          </button>
        )}
        <MoveToFolderSelect node={node} rootNodes={rootNodes} onMove={onMove} />
      </div>
      {isFolder && open && node.children?.map((c) => (
        <TecTreeNode
          key={c.id}
          node={c}
          depth={depth + 1}
          rootNodes={rootNodes}
          onMove={onMove}
          onCreateSubfolder={onCreateSubfolder}
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
  const [folderName, setFolderName] = useState("")
  const [newFolderParentId, setNewFolderParentId] = useState("")
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "err" } | null>(null)

  const reloadSummaries = useCallback(async () => {
    const res = await fetch(`/api/questions/tec-tree?user_id=${userId}`)
    setSummaries(await res.json())
  }, [userId])

  const reloadTree = useCallback(async () => {
    if (!selected) return
    setLoading(true)
    const res = await fetch(
      `/api/questions/tec-tree?user_id=${userId}&tec_subject=${encodeURIComponent(selected)}`
    )
    const data = await res.json()
    setTree(data)
    setLoading(false)
  }, [userId, selected])

  useEffect(() => {
    reloadSummaries()
  }, [reloadSummaries])

  useEffect(() => {
    reloadTree()
  }, [reloadTree])

  const folderOptions = useMemo(
    () => listFolderOptions(tree?.nodes ?? []),
    [tree?.nodes]
  )

  const newFolderParentName = useMemo(() => {
    if (!newFolderParentId || !tree?.nodes.length) return null
    return findNodeById(tree.nodes, newFolderParentId)?.name ?? null
  }, [newFolderParentId, tree?.nodes])

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
    await reloadTree()
  }

  function startSubfolder(parentId: string) {
    setNewFolderParentId(parentId)
    setMessage(null)
  }

  async function moveNode(nodeId: string, parentId: string | null) {
    const res = await fetch("/api/questions/tec-tree", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, node_id: nodeId, parent_id: parentId }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage({ text: data.error ?? "Erro ao mover item", tone: "err" })
      return
    }
    await reloadTree()
  }

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
            <div className="mb-2 space-y-2 rounded-lg border bg-slate-50/80 p-3">
              <p className="text-xs text-slate-600">
                Crie pastas em qualquer nível. Use o seletor de cada linha para mover assuntos ou
                pastas; clique em <span className="font-medium">+ sub</span> para agregar dentro de
                uma pasta.
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
            {loading ? (
              <p className="text-sm text-slate-500">Carregando…</p>
            ) : !tree?.nodes.length && !tree?.ungrouped.length ? (
              <p className="text-sm text-slate-500">
                Clique em &quot;Importar assuntos do banco&quot; para começar.
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto rounded-lg border p-2">
                {tree?.nodes.map((n) => (
                  <TecTreeNode
                    key={n.id}
                    node={n}
                    depth={0}
                    rootNodes={tree.nodes}
                    onMove={moveNode}
                    onCreateSubfolder={startSubfolder}
                  />
                ))}
                {tree?.ungrouped && tree.ungrouped.length > 0 && (
                  <div className="mt-4 border-t pt-3">
                    <p className="mb-2 text-xs font-medium text-slate-500">Sem pasta</p>
                    {tree.ungrouped.map((n) => (
                      <TecTreeNode
                        key={n.id}
                        node={n}
                        depth={0}
                        rootNodes={tree.nodes}
                        onMove={moveNode}
                        onCreateSubfolder={startSubfolder}
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
