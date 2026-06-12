"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft } from "lucide-react"
import NotebookFolderSelect from "@/components/questions/NotebookFolderSelect"

import { encodeTecTopicPair } from "@/lib/tec-facets"
import type { TecSubjectTreeResponse } from "@/lib/tec-subject-tree-types"
import type { FacetQuality } from "@/lib/tec-facets"

type TecGroup = {
  tec_subject: string
  topics: string[]
  topic_qualities?: Record<string, FacetQuality>
}

type Facets = {
  bancas: string[]
  orgaos: string[]
  cargos: string[]
  anos: number[]
  tec_subjects: string[]
  tec_topics: string[]
  tec_groups: TecGroup[]
  tec_trees?: TecSubjectTreeResponse[]
}

const CATEGORIES = [
  { key: "banca", label: "Banca" },
  { key: "orgao", label: "Órgão" },
  { key: "cargo", label: "Cargo" },
  { key: "ano", label: "Ano" },
  { key: "tec_subject", label: "Matéria TEC" },
  { key: "tec_topic", label: "Assuntos (por matéria)" },
] as const

type Subject = { id: string; name: string }

type BankTreeNodeProps = {
  node: import("@/lib/tec-subject-tree-types").TecSubjectNode
  depth: number
  tecSubject: string
  isTopicChecked: (s: string, t: string) => boolean
  toggleTopic: (s: string, t: string) => void
}

function BankTreeNode({
  node,
  depth,
  tecSubject,
  isTopicChecked,
  toggleTopic,
}: BankTreeNodeProps) {
  if (node.node_type === "topic" && node.tec_topic) {
    return (
      <label
        className="flex cursor-pointer items-center gap-2 py-0.5 text-sm"
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        <input
          type="checkbox"
          checked={isTopicChecked(tecSubject, node.tec_topic)}
          onChange={() => toggleTopic(tecSubject, node.tec_topic!)}
        />
        <span className="truncate">{node.name}</span>
        <span className="text-xs text-slate-400">
          {node.question_count} ({node.percent?.toFixed(1)}%)
        </span>
      </label>
    )
  }
  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <p className="py-1 text-sm font-medium text-slate-700">{node.name}</p>
      {node.children?.map((c) => (
        <BankTreeNode
          key={c.id}
          node={c}
          depth={depth + 1}
          tecSubject={tecSubject}
          isTopicChecked={isTopicChecked}
          toggleTopic={toggleTopic}
        />
      ))}
    </div>
  )
}

export default function BancoPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [activeCategory, setActiveCategory] = useState<string>("banca")
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [tecPairs, setTecPairs] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [cadernoName, setCadernoName] = useState("")
  const [subjectId, setSubjectId] = useState("")
  const [folderId, setFolderId] = useState("")

  const loadCount = useCallback(async () => {
    if (!userId) return
    const params = new URLSearchParams({ user_id: userId, limit: "1" })
    Object.entries(filters).forEach(([k, vals]) => vals.forEach((v) => params.append(k, v)))
    tecPairs.forEach((p) => params.append("tec_pair", p))
    const res = await fetch(`/api/questions/bank?${params}`)
    const data = await res.json()
    setTotal(data.total ?? 0)
  }, [userId, filters, tecPairs])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      fetch(`/api/questions/bank?facets=1&user_id=${user.id}&include_hidden=1`)
        .then((r) => r.json())
        .then(setFacets)
      fetch(`/api/subjects?user_id=${user.id}`).then((r) => r.json()).then(setSubjects)
    })
  }, [router])

  useEffect(() => {
    loadCount()
  }, [loadCount])

  function toggleFilter(key: string, value: string) {
    setFilters((prev) => {
      const cur = prev[key] ?? []
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      return { ...prev, [key]: next }
    })
  }

  /** Assunto com par (matéria, assunto) para evitar colisão cross-matéria. */
  function toggleTopic(tecSubject: string, tecTopic: string) {
    const pair = encodeTecTopicPair(tecSubject, tecTopic)
    setTecPairs((prev) => {
      const has = prev.includes(pair)
      const next = has ? prev.filter((p) => p !== pair) : [...prev, pair]
      return next
    })
    setFilters((prev) => {
      const subjects = prev.tec_subject ?? []
      if (!subjects.includes(tecSubject)) {
        return { ...prev, tec_subject: [...subjects, tecSubject] }
      }
      return prev
    })
  }

  function isTopicChecked(tecSubject: string, tecTopic: string) {
    return tecPairs.includes(encodeTecTopicPair(tecSubject, tecTopic))
  }

  function facetValues(key: string): string[] {
    if (!facets) return []
    const map: Record<string, string[] | number[]> = {
      banca: facets.bancas,
      orgao: facets.orgaos,
      cargo: facets.cargos,
      ano: facets.anos.map(String),
      tec_subject: facets.tec_subjects,
      tec_topic: facets.tec_topics,
    }
    return (map[key] ?? []) as string[]
  }

  const visibleTecGroups = (): TecGroup[] => {
    if (!facets?.tec_groups.length) return []
    const selectedSubjects = filters.tec_subject ?? []
    if (activeCategory === "tec_topic" && selectedSubjects.length > 0) {
      return facets.tec_groups.filter((g) => selectedSubjects.includes(g.tec_subject))
    }
    return facets.tec_groups
  }

  async function createFromFilter() {
    if (!userId || !cadernoName || !subjectId) return
    const res = await fetch("/api/notebooks/from-filter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        name: cadernoName,
        subject_id: subjectId,
        folder_id: folderId || null,
        filters: { ...filters, tec_topic_pairs: tecPairs.map((p) => {
          const idx = p.indexOf("\0")
          return idx >= 0
            ? { tec_subject: p.slice(0, idx), tec_topic: p.slice(idx + 1) }
            : null
        }).filter(Boolean) },
        limit: 200,
      }),
    })
    const data = await res.json()
    if (data.notebook_id) router.push(`/questoes/cadernos/${data.notebook_id}`)
  }

  const activeFilters = [
    ...Object.entries(filters).flatMap(([k, vals]) => vals.map((v) => ({ k, v }))),
    ...tecPairs.map((p) => {
      const i = p.indexOf("\0")
      return { k: "tec_pair", v: i >= 0 ? `${p.slice(0, i)} → ${p.slice(i + 1)}` : p }
    }),
  ]

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col p-4">
      <Link href="/questoes" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="text-xl font-bold">Banco de questões</h1>
      <p className="mt-1 text-xs text-slate-500">
        Matéria e assunto TEC vêm juntos no PDF. Ao marcar um assunto, a matéria dele entra no filtro.
      </p>
      <div className="mt-4 flex min-h-0 flex-1 gap-4">
        <nav className="w-44 shrink-0 space-y-1 border-r pr-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveCategory(c.key)}
              className={`block w-full rounded px-3 py-2 text-left text-sm ${
                activeCategory === c.key ? "bg-blue-50 font-medium text-blue-800" : ""
              }`}
            >
              {c.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto border-r pr-4">
          <p className="mb-2 text-sm font-medium text-slate-600">{activeCategory}</p>

          {activeCategory === "tec_topic" && facets?.tec_groups.length ? (
            <div className="space-y-4">
              {(filters.tec_subject?.length ?? 0) > 0 && (
                <p className="text-xs text-slate-500">
                  Mostrando assuntos das matérias selecionadas. Limpe &quot;Matéria TEC&quot; para ver
                  todas.
                </p>
              )}
              {(facets.tec_trees ?? []).length > 0 &&
                visibleTecGroups().some((g) =>
                  facets.tec_trees?.some((t) => t.tec_subject === g.tec_subject)
                ) &&
                facets.tec_trees!.filter((t) =>
                  visibleTecGroups().some((g) => g.tec_subject === t.tec_subject)
                ).map((tree) => (
                  <div key={tree.tec_subject} className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                    <p className="mb-2 text-sm font-semibold text-violet-900">
                      {tree.tec_subject} (organizada)
                    </p>
                    {tree.nodes.map((node) => (
                      <BankTreeNode
                        key={node.id}
                        node={node}
                        depth={0}
                        isTopicChecked={isTopicChecked}
                        toggleTopic={toggleTopic}
                        tecSubject={tree.tec_subject}
                      />
                    ))}
                    {tree.ungrouped.map((node) => (
                      <BankTreeNode
                        key={node.id}
                        node={node}
                        depth={0}
                        isTopicChecked={isTopicChecked}
                        toggleTopic={toggleTopic}
                        tecSubject={tree.tec_subject}
                      />
                    ))}
                  </div>
                ))}
              {visibleTecGroups().map((g) => (
                <div key={g.tec_subject} className="rounded-lg border bg-slate-50/80 p-3">
                  <label className="flex cursor-pointer items-center gap-2 border-b border-slate-200 pb-2 text-sm font-semibold text-blue-800">
                    <input
                      type="checkbox"
                      checked={(filters.tec_subject ?? []).includes(g.tec_subject)}
                      onChange={() => toggleFilter("tec_subject", g.tec_subject)}
                    />
                    {g.tec_subject}
                  </label>
                  <ul className="mt-2 space-y-1 pl-1">
                    {g.topics.map((topic) => (
                      <li key={`${g.tec_subject}|||${topic}`}>
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={isTopicChecked(g.tec_subject, topic)}
                            onChange={() => toggleTopic(g.tec_subject, topic)}
                          />
                          <span>
                            {topic}
                            {g.topic_qualities?.[topic] === "warn" && (
                              <span className="ml-1 text-xs text-amber-600">⚠</span>
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-1">
              {facetValues(activeCategory).map((v) => (
                <li key={v}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={(filters[activeCategory] ?? []).includes(v)}
                      onChange={() => toggleFilter(activeCategory, v)}
                    />
                    {v}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex w-72 shrink-0 flex-col">
          <p className="text-sm font-medium">Filtros ativos: {activeFilters.length}</p>
          <ul className="mt-2 flex-1 overflow-y-auto text-xs text-slate-600">
            {activeFilters.map(({ k, v }) => (
              <li key={`${k}-${v}`} className="mb-1 rounded bg-slate-100 px-2 py-1">
                {k === "tec_subject" ? "matéria" : k === "tec_topic" ? "assunto" : k}: {v}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-lg font-semibold text-blue-700">
            {total.toLocaleString("pt-BR")} questões encontradas
          </p>
          <div className="mt-4 space-y-2 border-t pt-4">
            <input
              value={cadernoName}
              onChange={(e) => setCadernoName(e.target.value)}
              placeholder="Nome do novo caderno"
              className="w-full rounded border px-2 py-1 text-sm"
            />
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value)
                setFolderId("")
              }}
              className="w-full rounded border px-2 py-1 text-sm"
            >
              <option value="">Sua matéria (organização)</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {userId && subjectId && (
              <NotebookFolderSelect
                userId={userId}
                subjectId={subjectId}
                value={folderId}
                onChange={setFolderId}
                label="Subpasta (opcional)"
                className="block text-sm"
                selectClassName="w-full rounded border px-2 py-1 text-sm"
              />
            )}
            <button
              type="button"
              onClick={createFromFilter}
              disabled={!cadernoName || !subjectId || total === 0}
              className="w-full rounded bg-slate-900 py-2 text-sm text-white disabled:opacity-50"
            >
              Criar caderno com filtro
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
