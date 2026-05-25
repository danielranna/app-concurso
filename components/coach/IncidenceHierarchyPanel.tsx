"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import type { IncidenceTreeNode } from "@/lib/incidence-hierarchy"

type SubjectTree = {
  label: string
  total_quantity: number
  topic_count: number
  tree: IncidenceTreeNode[]
}

type HierarchyPayload = {
  document_id: string | null
  subjects: SubjectTree[]
  parse_stats: {
    subjects?: number
    topics?: number
    subtopics?: number
    rows_imported?: number
  } | null
}

function TreeBranch({
  node,
  depth,
  openCodes,
  toggle,
}: {
  node: IncidenceTreeNode
  depth: number
  openCodes: Set<string>
  toggle: (key: string) => void
}) {
  const key = `${depth}:${node.code}:${node.name}`
  const hasChildren = node.children.length > 0
  const open = openCodes.has(key)

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-1.5 py-0.5 text-sm hover:bg-slate-50 rounded pr-2"
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(key)}
            className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200"
            aria-label={open ? "Recolher" : "Expandir"}
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-slate-300 mx-0.5" />
        )}
        <span className="min-w-0 flex-1 text-slate-800">
          {node.code && (
            <span className="mr-1.5 font-mono text-[10px] text-slate-400">{node.code}</span>
          )}
          {node.name}
        </span>
        <span className="shrink-0 tabular-nums text-xs text-emerald-700">
          {node.quantity}{" "}
          <span className="text-slate-500">
            ({node.percent < 0.01 && node.percent > 0
              ? node.percent.toFixed(3)
              : node.percent.toFixed(2)}
            %)
          </span>
        </span>
      </div>
      {hasChildren && open && (
        <div>
          {node.children.map((child) => (
            <TreeBranch
              key={`${child.code}:${child.name}`}
              node={child}
              depth={depth + 1}
              openCodes={openCodes}
              toggle={toggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function IncidenceHierarchyPanel({
  userId,
  examTargetId,
  reloadKey = 0,
}: {
  userId: string
  examTargetId: string
  reloadKey?: number
}) {
  const [data, setData] = useState<HierarchyPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set())
  const [openCodes, setOpenCodes] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    setLoading(true)
    fetch(
      `/api/coach/exam-targets/${examTargetId}/incidence-hierarchy?user_id=${userId}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.error) alert(d.error)
        else {
          setData(d)
          const first = (d.subjects ?? []).slice(0, 2).map((s: SubjectTree) => s.label)
          setOpenSubjects(new Set(first))
        }
      })
      .finally(() => setLoading(false))
  }, [userId, examTargetId])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  function toggleSubject(label: string) {
    setOpenSubjects((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  function toggleCode(key: string) {
    setOpenCodes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando hierarquia do Excel…
      </div>
    )
  }

  if (!data?.subjects?.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
        Importe o Excel de incidência (colunas Hierarquia, Índice, Quantidade,
        Porcentagem) para ver a árvore de assuntos e subtópicos.
      </div>
    )
  }

  const stats = data.parse_stats

  return (
    <section className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/20 p-4">
      <div>
        <h3 className="text-lg font-bold text-slate-900">
          Mapa de incidência (Excel)
        </h3>
        <p className="text-sm text-slate-600">
          Hierarquia por matéria com % relativo ao nível pai. Expanda matérias e
          tópicos como no índice do caderno.
        </p>
        {stats && (
          <p className="mt-1 text-xs text-emerald-800">
            {stats.subjects ?? data.subjects.length} matérias ·{" "}
            {stats.topics ?? 0} linhas · {stats.subtopics ?? 0} subtópicos ·{" "}
            {stats.rows_imported ?? 0} gravadas no banco
          </p>
        )}
      </div>

      <ul className="space-y-2">
        {data.subjects.map((sub) => {
          const subOpen = openSubjects.has(sub.label)
          return (
            <li
              key={sub.label}
              className="overflow-hidden rounded-xl border border-white bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => toggleSubject(sub.label)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-slate-50"
              >
                {subOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                )}
                <span className="flex-1 font-semibold text-slate-900">{sub.label}</span>
                <span className="text-xs text-slate-500">
                  {sub.topic_count} itens · {sub.total_quantity} quest.
                </span>
              </button>
              {subOpen && (
                <div className="border-t border-slate-100 px-2 pb-3 pt-1 max-h-[480px] overflow-y-auto">
                  {sub.tree.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">Sem tópicos nesta matéria.</p>
                  ) : (
                    sub.tree.map((node) => (
                      <TreeBranch
                        key={`${sub.label}-${node.code}`}
                        node={node}
                        depth={0}
                        openCodes={openCodes}
                        toggle={toggleCode}
                      />
                    ))
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
