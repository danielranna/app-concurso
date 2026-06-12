"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react"
import type { SubjectContentNode } from "@/lib/content-index-types"

type Subject = { id: string; name: string }

function flattenTree(nodes: SubjectContentNode[]): SubjectContentNode[] {
  const out: SubjectContentNode[] = []
  function walk(list: SubjectContentNode[]) {
    for (const n of list) {
      out.push(n)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  onMoveToParent,
  groups,
}: {
  node: SubjectContentNode
  depth: number
  selectedId: string | null
  onSelect: (n: SubjectContentNode) => void
  onMoveToParent: (nodeId: string, parentId: string | null) => void
  groups: SubjectContentNode[]
}) {
  const [open, setOpen] = useState(true)
  const isGroup = node.node_type === "group"
  const active = selectedId === node.id

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded px-2 py-1.5 text-sm ${
          active ? "bg-teal-50 text-teal-900" : "hover:bg-slate-50"
        }`}
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        {isGroup ? (
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
        <button
          type="button"
          className="flex-1 truncate text-left"
          onClick={() => onSelect(node)}
        >
          {node.name}
          {node.node_type === "topic" && (
            <span className="ml-1 text-xs text-slate-400">({node.question_count})</span>
          )}
        </button>
        {node.node_type === "topic" && groups.length > 0 && (
          <select
            className="ml-1 max-w-[7rem] truncate rounded border border-slate-200 px-1 py-0.5 text-[10px]"
            value={node.parent_id ?? ""}
            onChange={(e) =>
              onMoveToParent(node.id, e.target.value || null)
            }
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">Sem grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {isGroup && open && node.children?.map((c) => (
        <TreeNode
          key={c.id}
          node={c}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onMoveToParent={onMoveToParent}
          groups={groups}
        />
      ))}
    </div>
  )
}

export default function CicloConteudoPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectId, setSubjectId] = useState("")
  const [tree, setTree] = useState<SubjectContentNode[]>([])
  const [ungrouped, setUngrouped] = useState<SubjectContentNode[]>([])
  const [selected, setSelected] = useState<SubjectContentNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [mirroringTec, setMirroringTec] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState("")
  const [banca, setBanca] = useState("")
  const [percent, setPercent] = useState("")

  const loadTree = useCallback(
    (uid: string, sid: string) => {
      setLoading(true)
      return fetch(`/api/ciclo/content?user_id=${uid}&subject_id=${sid}`)
        .then((r) => r.json())
        .then((d) => {
          setTree(d.nodes ?? [])
          setUngrouped(d.ungrouped ?? [])
        })
        .finally(() => setLoading(false))
    },
    []
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      fetch(`/api/subjects?user_id=${user.id}`)
        .then((r) => r.json())
        .then((list: Subject[]) => {
          setSubjects(Array.isArray(list) ? list : [])
          if (list?.[0]) {
            setSubjectId(list[0].id)
            loadTree(user.id, list[0].id)
          } else setLoading(false)
        })
    })
  }, [router, loadTree])

  useEffect(() => {
    if (userId && subjectId) loadTree(userId, subjectId)
  }, [userId, subjectId, loadTree])

  const allGroups = flattenTree(tree).filter((n) => n.node_type === "group")

  async function handleSyncNotebooks() {
    if (!userId || !subjectId) return
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await fetch("/api/ciclo/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "sync",
          subject_id: subjectId,
        }),
      })
      const d = await res.json()
      if (d.error) alert(d.error)
      else {
        setTree(d.tree?.nodes ?? [])
        setUngrouped(d.tree?.ungrouped ?? [])
        setSyncMessage(
          `Cadernos: ${d.synced ?? 0} sincronizado(s), ${d.skipped ?? 0} ignorado(s).`
        )
      }
    } finally {
      setSyncing(false)
    }
  }

  async function handleMirrorTecTree() {
    if (!userId || !subjectId) return
    setMirroringTec(true)
    setSyncMessage(null)
    try {
      const res = await fetch("/api/ciclo/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "mirror_tec_tree",
          subject_id: subjectId,
        }),
      })
      const d = await res.json()
      if (d.error) alert(d.error)
      else {
        setTree(d.tree?.nodes ?? [])
        setUngrouped(d.tree?.ungrouped ?? [])
        setSyncMessage(
          `Organizar TEC (${d.tec_subject}): ${d.folders ?? 0} pasta(s), ${d.topics ?? 0} assunto(s) espelhado(s).`
        )
      }
    } finally {
      setMirroringTec(false)
    }
  }

  async function createGroup() {
    if (!userId || !subjectId || !newGroupName.trim()) return
    const res = await fetch("/api/ciclo/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        action: "create_group",
        subject_id: subjectId,
        name: newGroupName.trim(),
      }),
    })
    const d = await res.json()
    if (d.error) alert(d.error)
    else {
      setNewGroupName("")
      loadTree(userId, subjectId)
    }
  }

  async function moveToParent(nodeId: string, parentId: string | null) {
    if (!userId) return
    await fetch("/api/ciclo/content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, node_id: nodeId, parent_id: parentId }),
    })
    loadTree(userId, subjectId)
  }

  async function addIncidence() {
    if (!userId || !selected || !banca.trim()) return
    const res = await fetch("/api/ciclo/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        action: "upsert_incidence",
        node_id: selected.id,
        banca: banca.trim(),
        percent: Number(percent) || 0,
      }),
    })
    const d = await res.json()
    if (d.error) alert(d.error)
    else {
      setSelected(d.node)
      setBanca("")
      setPercent("")
      loadTree(userId, subjectId)
    }
  }

  async function deleteIncidence(incidenceId: string) {
    if (!userId) return
    await fetch(
      `/api/ciclo/content?user_id=${userId}&incidence_id=${incidenceId}`,
      { method: "DELETE" }
    )
    if (selected) {
      const r = await fetch(
        `/api/ciclo/content?user_id=${userId}&node_id=${selected.id}`
      )
      const d = await r.json()
      setSelected(d.node ?? null)
    }
    loadTree(userId, subjectId)
  }

  async function deleteNode() {
    if (!userId || !selected) return
    if (!confirm(`Excluir "${selected.name}"?`)) return
    await fetch(
      `/api/ciclo/content?user_id=${userId}&node_id=${selected.id}`,
      { method: "DELETE" }
    )
    setSelected(null)
    loadTree(userId, subjectId)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/ciclo"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Conteúdo e hierarquia</h1>
          <p className="mt-1 text-sm text-slate-600">
            Espelhe a hierarquia do Organizar TEC ou sincronize tópicos a partir de
            cadernos. Defina incidência por banca em cada nó.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleMirrorTecTree}
            disabled={mirroringTec || syncing || !subjectId}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {mirroringTec ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar do Organizar TEC
          </button>
          <button
            type="button"
            onClick={handleSyncNotebooks}
            disabled={syncing || mirroringTec || !subjectId}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar de cadernos
          </button>
        </div>
      </div>

      {syncMessage && (
        <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {syncMessage}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Matéria</label>
        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <input
                type="text"
                placeholder="Novo grupo..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={createGroup}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <FolderPlus className="h-4 w-4" />
                Grupo
              </button>
            </div>

            <h2 className="text-xs font-semibold uppercase text-slate-500">
              Árvore
            </h2>
            <div className="mt-2 min-h-[200px]">
              {tree.length === 0 && ungrouped.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhum tópico. Use &quot;Sincronizar do Organizar TEC&quot; ou importe
                  cadernos.
                </p>
              ) : (
                tree.map((n) => (
                  <TreeNode
                    key={n.id}
                    node={n}
                    depth={0}
                    selectedId={selected?.id ?? null}
                    onSelect={setSelected}
                    onMoveToParent={moveToParent}
                    groups={allGroups}
                  />
                ))
              )}
            </div>

            {ungrouped.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold uppercase text-slate-500">
                  Sem grupo
                </h3>
                <ul className="mt-2 space-y-1">
                  {ungrouped.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(n)}
                        className="w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-50"
                      >
                        {n.name}{" "}
                        <span className="text-xs text-slate-400">
                          ({n.question_count})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            {selected ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {selected.name}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {selected.node_type === "group" ? "Grupo" : "Tópico TEC"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={deleteNode}
                    className="rounded p-1 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {selected.tec_topic && (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">TEC:</span> {selected.tec_subject} —{" "}
                    {selected.tec_topic}
                  </p>
                )}
                {selected.notebook_id && (
                  <Link
                    href={`/questoes/cadernos/${selected.notebook_id}`}
                    className="text-sm text-teal-700 underline"
                  >
                    Abrir caderno ({selected.question_count} questões)
                  </Link>
                )}

                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    Incidência por banca
                  </h3>
                  <ul className="mt-2 space-y-1">
                    {(selected.incidence ?? []).map((inc) => (
                      <li
                        key={inc.id ?? inc.banca}
                        className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-sm"
                      >
                        <span>
                          {inc.banca}: {inc.percent}%
                        </span>
                        {inc.id && (
                          <button
                            type="button"
                            onClick={() => deleteIncidence(inc.id!)}
                            className="text-xs text-red-600"
                          >
                            remover
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      type="text"
                      placeholder="Banca"
                      value={banca}
                      onChange={(e) => setBanca(e.target.value)}
                      className="w-28 rounded border border-slate-200 px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="%"
                      value={percent}
                      onChange={(e) => setPercent(e.target.value)}
                      className="w-20 rounded border border-slate-200 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={addIncidence}
                      className="rounded bg-slate-800 px-3 py-1 text-sm text-white"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Selecione um nó na árvore para ver detalhes e incidência.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
