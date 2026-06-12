"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronRight, FolderPlus, RefreshCw } from "lucide-react"
import type { TecSubjectNode, TecSubjectSummary } from "@/lib/tec-subject-tree-types"

function TecTreeNode({
  node,
  depth,
  folders,
  onMove,
}: {
  node: TecSubjectNode
  depth: number
  folders: TecSubjectNode[]
  onMove: (nodeId: string, parentId: string | null) => void
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
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className="shrink-0 text-xs text-slate-400">
          {node.question_count} ({node.percent?.toFixed(1) ?? 0}%)
        </span>
        {node.node_type === "topic" && folders.length > 0 && (
          <select
            className="ml-1 max-w-[6rem] truncate rounded border px-1 py-0.5 text-[10px]"
            value={node.parent_id ?? ""}
            onChange={(e) => onMove(node.id, e.target.value || null)}
          >
            <option value="">Sem pasta</option>
            {folders.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {isFolder && open && node.children?.map((c) => (
        <TecTreeNode
          key={c.id}
          node={c}
          depth={depth + 1}
          folders={folders}
          onMove={onMove}
        />
      ))}
    </div>
  )
}

function flattenFolders(nodes: TecSubjectNode[]): TecSubjectNode[] {
  const out: TecSubjectNode[] = []
  function walk(list: TecSubjectNode[]) {
    for (const n of list) {
      if (n.node_type === "folder") out.push(n)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
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
  const [message, setMessage] = useState<string | null>(null)

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

  async function seedTopics() {
    if (!selected) return
    setLoading(true)
    const res = await fetch("/api/questions/tec-tree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, action: "seed", tec_subject: selected }),
    })
    const data = await res.json()
    setMessage(`Importados ${data.created ?? 0} assuntos (${data.skipped ?? 0} já existiam).`)
    setTree(data.tree ?? null)
    await reloadSummaries()
    setLoading(false)
  }

  async function createFolder() {
    if (!selected || !folderName.trim()) return
    await fetch("/api/questions/tec-tree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        action: "create_folder",
        tec_subject: selected,
        name: folderName.trim(),
      }),
    })
    setFolderName("")
    await reloadTree()
  }

  async function moveNode(nodeId: string, parentId: string | null) {
    await fetch("/api/questions/tec-tree", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, node_id: nodeId, parent_id: parentId }),
    })
    await reloadTree()
  }

  const folders = tree ? flattenFolders(tree.nodes) : []

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
              <p className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                {message}
              </p>
            )}
            <div className="mb-4 flex gap-2">
              <input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Nome da pasta (ex.: Microeconomia)"
                className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm"
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
                    folders={folders}
                    onMove={moveNode}
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
                        folders={folders}
                        onMove={moveNode}
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
