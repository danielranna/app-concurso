"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Tooltip,
} from "recharts"
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import PerformanceStackBar from "@/components/questions/PerformanceStackBar"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type {
  QuestionStatisticsResult,
  StatsPeriod,
  SubjectStatRow,
  TopicStatRow,
} from "@/lib/question-statistics"

type SortMode = "index" | "strong" | "weak"

const PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: "all", label: "Acumulado" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
]

function sortSubjects(rows: SubjectStatRow[], mode: SortMode): SubjectStatRow[] {
  const copy = [...rows]
  if (mode === "strong") {
    return copy.sort((a, b) => b.correct_pct - a.correct_pct || b.total - a.total)
  }
  if (mode === "weak") {
    return copy.sort((a, b) => a.correct_pct - b.correct_pct || b.total - a.total)
  }
  return copy.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

function TopicRow({
  topic,
  showGraph,
  showText,
  depth = 1,
}: {
  topic: TopicStatRow
  showGraph: boolean
  showText: boolean
  depth?: number
}) {
  return (
    <tr className="border-t border-slate-100 bg-slate-50/60">
      <td className="py-2 pr-4" style={{ paddingLeft: `${depth * 1.25 + 2}rem` }}>
        <span className="text-sm text-slate-700">{topic.name}</span>
      </td>
      <td className="py-2 text-center text-sm tabular-nums text-slate-600">{topic.total}</td>
      <td className="py-2">
        {showGraph && (
          <PerformanceStackBar
            correct={topic.correct}
            wrong={topic.wrong}
            showText={showText}
          />
        )}
        {!showGraph && showText && (
          <span className="text-xs text-slate-600">
            {topic.correct_pct}% ({topic.correct}) / {100 - topic.correct_pct}% ({topic.wrong})
          </span>
        )}
      </td>
    </tr>
  )
}

function SubjectBlock({
  row,
  expanded,
  onToggle,
  showGraph,
  showText,
}: {
  row: SubjectStatRow
  expanded: boolean
  onToggle: () => void
  showGraph: boolean
  showText: boolean
}) {
  return (
    <>
      <tr className="border-t border-slate-200 hover:bg-slate-50/80">
        <td className="py-3 pr-4">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 text-left"
            disabled={!row.topics.length}
          >
            {row.topics.length > 0 ? (
              expanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
              )
            ) : (
              <span className="inline-block w-4" />
            )}
            <span className="font-medium text-slate-900">{row.name}</span>
          </button>
        </td>
        <td className="py-3 text-center text-sm font-medium tabular-nums text-slate-700">
          {row.total}
        </td>
        <td className="py-3">
          {showGraph && (
            <PerformanceStackBar correct={row.correct} wrong={row.wrong} showText={showText} />
          )}
          {!showGraph && showText && (
            <span className="text-xs text-slate-600">
              {row.correct_pct}% ({row.correct}) / {100 - row.correct_pct}% ({row.wrong})
            </span>
          )}
        </td>
      </tr>
      {expanded &&
        row.topics.map((t) => (
          <TopicRow key={t.name} topic={t} showGraph={showGraph} showText={showText} />
        ))}
    </>
  )
}

export default function QuestoesEstatisticasPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [period, setPeriod] = useState<StatsPeriod>("all")
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set())
  const [allSubjects, setAllSubjects] = useState<{ id: string; name: string }[]>([])
  const [data, setData] = useState<QuestionStatisticsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>("index")
  const [showGraph, setShowGraph] = useState(true)
  const [showText, setShowText] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const loadStats = useCallback(
    async (uid: string, p: StatsPeriod, subjectFilter: Set<string>) => {
      setLoading(true)
      const params = new URLSearchParams({ user_id: uid, period: p })
      if (
        allSubjects.length > 0 &&
        subjectFilter.size > 0 &&
        subjectFilter.size < allSubjects.length
      ) {
        params.set("subject_ids", [...subjectFilter].join(","))
      }
      const res = await fetch(`/api/questions/statistics?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar")
      setData(json)
      setLoading(false)
    },
    [allSubjects.length]
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      fetch(`/api/questions/panel?user_id=${user.id}`)
        .then((r) => r.json())
        .then((d) => {
          const subs = (d.subjects ?? []).map((s: { id: string; name: string }) => ({
            id: s.id,
            name: s.name,
          }))
          setAllSubjects(subs)
          setSelectedSubjects(new Set(subs.map((s: { id: string }) => s.id)))
        })
    })
  }, [router])

  useEffect(() => {
    if (!userId) return
    if (allSubjects.length > 0 && selectedSubjects.size === 0) {
      setData(null)
      setLoading(false)
      return
    }
    loadStats(userId, period, selectedSubjects).catch(() => setLoading(false))
  }, [userId, period, selectedSubjects, allSubjects.length, loadStats])

  const displayRows = useMemo(() => {
    if (!data) return []
    const rows = [...data.by_subject.filter((r) => r.total > 0)]
    if (data.unassigned && data.unassigned.total > 0) {
      rows.push({
        id: "__unassigned__",
        name: data.unassigned.label,
        short_label: "OUT",
        correct: data.unassigned.correct,
        wrong: data.unassigned.wrong,
        total: data.unassigned.total,
        correct_pct: data.unassigned.correct_pct,
        topics: data.unassigned.topics,
      })
    }
    return sortSubjects(rows, sortMode)
  }, [data, sortMode])

  const radarData = useMemo(
    () =>
      displayRows
        .filter((r) => r.id !== "__unassigned__")
        .map((r) => ({
          subject: r.short_label,
          pct: r.correct_pct,
          fullName: r.name,
        })),
    [displayRows]
  )

  const pieData = useMemo(() => {
    if (!data?.summary.total_attempts) return []
    return [
      { name: "Acertos", value: data.summary.correct, color: "#22c55e" },
      { name: "Erros", value: data.summary.wrong, color: "#ef4444" },
    ]
  }, [data])

  const toggleSubject = (id: string) => {
    setSelectedSubjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = selectedSubjects.size === allSubjects.length

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Estatísticas</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Cada resposta em um caderno conta separadamente. No estudo combinado da semana, a
          mesma questão aparece uma vez na fila (mesmo em vários cadernos).
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-500">Período</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as StatsPeriod)}
            className="flex h-10 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {allSubjects.length > 0 && (
        <Card>
          <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">Filtrar matérias</p>
            <button
              type="button"
              onClick={() =>
                setSelectedSubjects(
                  allSelected ? new Set() : new Set(allSubjects.map((s) => s.id))
                )
              }
              className="text-xs font-medium text-teal-700 hover:underline"
            >
              {allSelected ? "Desmarcar todas" : "Marcar todas"}
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {allSubjects.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-2 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedSubjects.has(s.id)}
                  onChange={() => toggleSubject(s.id)}
                  className="rounded border-slate-300"
                />
                <span className="text-slate-700">{s.name}</span>
              </label>
            ))}
          </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando estatísticas…
        </div>
      ) : !data?.summary.total_attempts ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
          Nenhuma questão respondida no período e filtros selecionados.
        </div>
      ) : (
        <>
          <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Questões resolvidas</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {data.summary.total_attempts}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total de matérias</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {data.summary.subject_count}
                </p>
              </div>
              <div>
                <p className="text-xs text-green-700">Acertos</p>
                <p className="text-2xl font-bold tabular-nums text-green-600">
                  {data.summary.correct}
                </p>
              </div>
              <div>
                <p className="text-xs text-red-600">Erros</p>
                <p className="text-2xl font-bold tabular-nums text-red-600">
                  {data.summary.wrong}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-xs font-medium text-slate-600">Taxa de acerto</p>
              <div className="relative h-44 w-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      innerRadius={52}
                      outerRadius={72}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {pieData.map((e, i) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-bold text-slate-800">
                    {data.summary.correct_pct}%
                  </span>
                </div>
              </div>
            </div>

            <div className="min-h-[200px] rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-xs font-medium text-slate-600">Por matéria (% acerto)</p>
              {radarData.length >= 3 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                    <Radar
                      name="Acerto"
                      dataKey="pct"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.35}
                    />
                    <Tooltip
                      formatter={(v) => [`${v ?? 0}%`, "Acerto"]}
                      labelFormatter={(_, payload) =>
                        (payload?.[0]?.payload as { fullName?: string } | undefined)
                          ?.fullName ?? ""
                      }
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">
                  Resolva questões em pelo menos 3 matérias para ver o radar.
                </p>
              )}
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold text-slate-900">
                Desempenho por Matéria e Assunto
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-6 text-sm">
                <fieldset className="flex flex-wrap items-center gap-3">
                  <legend className="sr-only">Ordem</legend>
                  <span className="text-slate-600">Ordem:</span>
                  {(
                    [
                      ["index", "Índice"],
                      ["strong", "Pontos fortes"],
                      ["weak", "Pontos fracos"],
                    ] as const
                  ).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="sort"
                        checked={sortMode === val}
                        onChange={() => setSortMode(val)}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <fieldset className="flex flex-wrap items-center gap-3">
                  <span className="text-slate-600">Exibir:</span>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={showGraph}
                      onChange={(e) => setShowGraph(e.target.checked)}
                    />
                    Gráfico
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={showText}
                      onChange={(e) => setShowText(e.target.checked)}
                    />
                    Texto
                  </label>
                </fieldset>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    <th className="px-4 py-3">Matéria / Assunto</th>
                    <th className="w-28 px-2 py-3 text-center">Resolvidas</th>
                    <th className="px-4 py-3">Desempenho</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => (
                    <SubjectBlock
                      key={row.id}
                      row={row}
                      expanded={expanded.has(row.id)}
                      onToggle={() => toggleExpand(row.id)}
                      showGraph={showGraph}
                      showText={showText}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
