"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, ChevronDown, ChevronRight, RefreshCw } from "lucide-react"
import NotebookFolderSelect from "@/components/questions/NotebookFolderSelect"
import { QuestoesPageHeader } from "@/components/questions/questoes-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { encodeTecTopicPair } from "@/lib/tec-facets"
import type { TecSubjectTreeResponse } from "@/lib/tec-subject-tree-types"
import type { FacetQuality } from "@/lib/tec-facets"

type TecGroup = {
  tec_subject: string
  topics: string[]
  topic_qualities?: Record<string, FacetQuality>
}

type OrphanTecTopics = {
  tec_subject: string
  topics: string[]
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
  orphan_topics?: OrphanTecTopics[]
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

type TecSubjectNode = import("@/lib/tec-subject-tree-types").TecSubjectNode

function countTreeTopics(nodes: TecSubjectNode[]): number {
  let total = 0
  for (const node of nodes) {
    if (node.node_type === "topic") total++
    if (node.children?.length) total += countTreeTopics(node.children)
  }
  return total
}

type BankTreeNodeProps = {
  node: TecSubjectNode
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
  const [open, setOpen] = useState(false)

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
        <span className="shrink-0 text-xs text-slate-400">
          {node.question_count} ({node.percent?.toFixed(1)}%)
        </span>
      </label>
    )
  }

  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 py-1 text-left text-sm font-medium text-slate-700"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className="shrink-0 text-xs font-normal text-slate-400">
          {node.question_count}
        </span>
      </button>
      {open &&
        node.children?.map((c) => (
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

function SubjectCollapsible({
  title,
  subtitle,
  topicCount,
  defaultOpen = false,
  headerCheckbox,
  variant = "default",
  children,
}: {
  title: string
  subtitle?: string
  topicCount?: number
  defaultOpen?: boolean
  headerCheckbox?: ReactNode
  variant?: "default" | "organized"
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const boxClass =
    variant === "organized"
      ? "border-violet-200/80 bg-violet-50/40"
      : "border-slate-200/80 bg-slate-50/50"

  return (
    <Card className={cn("p-3", boxClass)}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-0.5 shrink-0 text-slate-500"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {headerCheckbox}
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className={`text-left text-sm font-semibold ${
                variant === "organized" ? "text-violet-900" : "text-blue-800"
              }`}
            >
              {title}
              {variant === "organized" && (
                <span className="ml-1 text-xs font-normal text-violet-700">(organizada)</span>
              )}
            </button>
            {topicCount != null && (
              <span className="text-xs text-slate-500">{topicCount} assunto(s)</span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {open && <div className="mt-2 border-t border-slate-200/80 pt-2">{children}</div>}
    </Card>
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
  const [facetsLoading, setFacetsLoading] = useState(false)

  const loadFacets = useCallback(async (uid: string) => {
    setFacetsLoading(true)
    try {
      const res = await fetch(
        `/api/questions/bank?facets=1&user_id=${uid}&include_hidden=1`
      )
      const data = await res.json()
      setFacets(data)
    } finally {
      setFacetsLoading(false)
    }
  }, [])

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
      loadFacets(user.id)
      fetch(`/api/subjects?user_id=${user.id}`).then((r) => r.json()).then(setSubjects)
    })
  }, [router, loadFacets])

  useEffect(() => {
    if (!userId) return
    const uid = userId
    function onVisible() {
      if (document.visibilityState === "visible") void loadFacets(uid)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [userId, loadFacets])

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

  const visibleTecGroups = useMemo((): TecGroup[] => {
    if (!facets?.tec_groups.length) return []
    const selectedSubjects = filters.tec_subject ?? []
    if (activeCategory === "tec_topic" && selectedSubjects.length > 0) {
      return facets.tec_groups.filter((g) => selectedSubjects.includes(g.tec_subject))
    }
    return facets.tec_groups
  }, [facets?.tec_groups, activeCategory, filters.tec_subject])

  const organizedSubjectSet = useMemo(
    () => new Set((facets?.tec_trees ?? []).map((t) => t.tec_subject)),
    [facets?.tec_trees]
  )

  const flatTecGroups = useMemo(
    () => visibleTecGroups.filter((g) => !organizedSubjectSet.has(g.tec_subject)),
    [visibleTecGroups, organizedSubjectSet]
  )

  const visibleTecTrees = useMemo(
    () =>
      (facets?.tec_trees ?? []).filter((t) =>
        visibleTecGroups.some((g) => g.tec_subject === t.tec_subject)
      ),
    [facets?.tec_trees, visibleTecGroups]
  )

  const orphanBySubject = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const row of facets?.orphan_topics ?? []) {
      map.set(row.tec_subject, row.topics)
    }
    return map
  }, [facets?.orphan_topics])

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
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-4">
      <QuestoesPageHeader
        title="Banco de questões"
        description="Matéria e assunto TEC vêm juntos no PDF. Ao marcar um assunto, a matéria dele entra no filtro."
        className="space-y-2"
      />
      <div className="flex min-h-0 flex-1 gap-4">
        <nav className="w-48 shrink-0 space-y-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveCategory(c.key)}
              className={cn(
                "block w-full rounded-xl px-3 py-2 text-left text-sm transition",
                activeCategory === c.key
                  ? "bg-teal-600 font-medium text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {c.label}
            </button>
          ))}
        </nav>
        <Card className="min-w-0 flex-1 overflow-hidden">
          <CardContent className="h-full overflow-y-auto p-4">
          <p className="mb-3 text-sm font-medium text-slate-600">{activeCategory}</p>

          {activeCategory === "tec_topic" && facets?.tec_groups.length ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => userId && loadFacets(userId)}
                  disabled={facetsLoading || !userId}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${facetsLoading ? "animate-spin" : ""}`} />
                  Atualizar assuntos
                </Button>
              </div>
              {(filters.tec_subject?.length ?? 0) > 0 && (
                <p className="text-xs text-slate-500">
                  Mostrando assuntos das matérias selecionadas. Limpe &quot;Matéria TEC&quot; para ver
                  todas.
                </p>
              )}
              {visibleTecTrees.map((tree) => {
                const topicCount =
                  tree.ungrouped.length + countTreeTopics(tree.nodes)
                const orphans = orphanBySubject.get(tree.tec_subject) ?? []
                const bankGroup = facets.tec_groups.find(
                  (g) => g.tec_subject === tree.tec_subject
                )
                const totalBankTopics = bankGroup?.topics.length ?? topicCount
                return (
                  <SubjectCollapsible
                    key={tree.tec_subject}
                    title={tree.tec_subject}
                    topicCount={topicCount}
                    subtitle={
                      orphans.length > 0
                        ? `${topicCount} no índice · ${totalBankTopics} no banco · ${orphans.length} fora do índice`
                        : undefined
                    }
                    variant="organized"
                    headerCheckbox={
                      <input
                        type="checkbox"
                        checked={(filters.tec_subject ?? []).includes(tree.tec_subject)}
                        onChange={() => toggleFilter("tec_subject", tree.tec_subject)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    }
                  >
                    {tree.ungrouped.length > 0 && (
                      <p className="mb-1 text-xs font-medium text-slate-500">Sem pasta</p>
                    )}
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
                    {orphans.length > 0 && (
                      <div className="mt-3 border-t border-violet-200/80 pt-2">
                        <p className="mb-1 text-xs font-medium text-amber-800">
                          Fora do índice ({orphans.length})
                        </p>
                        <ul className="space-y-1 pl-1">
                          {orphans.map((topic) => (
                            <li key={`${tree.tec_subject}|||orphan|||${topic}`}>
                              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                                <input
                                  type="checkbox"
                                  className="mt-0.5"
                                  checked={isTopicChecked(tree.tec_subject, topic)}
                                  onChange={() => toggleTopic(tree.tec_subject, topic)}
                                />
                                <span className="min-w-0 flex-1 break-words">{topic}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </SubjectCollapsible>
                )
              })}
              {flatTecGroups.map((g) => (
                <SubjectCollapsible
                  key={g.tec_subject}
                  title={g.tec_subject}
                  topicCount={g.topics.length}
                  subtitle={
                    g.topics.some((t) => g.topic_qualities?.[t] === "warn")
                      ? "⚠ assuntos com parse suspeito ou sem classificação"
                      : undefined
                  }
                  headerCheckbox={
                    <input
                      type="checkbox"
                      checked={(filters.tec_subject ?? []).includes(g.tec_subject)}
                      onChange={() => toggleFilter("tec_subject", g.tec_subject)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  }
                >
                  <ul className="space-y-1 pl-1">
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
                </SubjectCollapsible>
              ))}
              {visibleTecTrees.length === 0 && flatTecGroups.length === 0 && (
                <p className="text-sm text-slate-500">
                  Nenhuma matéria com assuntos no banco. Importe questões com matéria e assunto TEC
                  preenchidos.
                </p>
              )}
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
          </CardContent>
        </Card>
        <Card className="flex w-72 shrink-0 flex-col">
          <CardContent className="flex flex-1 flex-col p-4">
          <p className="text-sm font-medium text-slate-700">
            Filtros ativos{" "}
            <Badge variant="secondary" className="ml-1">
              {activeFilters.length}
            </Badge>
          </p>
          <ul className="mt-3 flex-1 space-y-1 overflow-y-auto">
            {activeFilters.map(({ k, v }) => (
              <li key={`${k}-${v}`}>
                <Badge variant="outline" className="w-full justify-start font-normal">
                  {k === "tec_subject" ? "matéria" : k === "tec_topic" ? "assunto" : k}: {v}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-2xl font-semibold tracking-tight text-teal-700">
            {total.toLocaleString("pt-BR")}
          </p>
          <p className="text-xs text-slate-500">questões encontradas</p>
          <div className="mt-4 space-y-2 border-t border-slate-200/80 pt-4">
            <Input
              value={cadernoName}
              onChange={(e) => setCadernoName(e.target.value)}
              placeholder="Nome do novo caderno"
            />
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value)
                setFolderId("")
              }}
              className="flex h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30"
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
                selectClassName="flex h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm shadow-sm"
              />
            )}
            <Button
              type="button"
              onClick={createFromFilter}
              disabled={!cadernoName || !subjectId || total === 0}
              className="w-full"
            >
              Criar caderno com filtro
            </Button>
          </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
