"use client"

import { Fragment, useMemo, useState } from "react"
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { ChevronDown, ChevronRight } from "lucide-react"
import {
  BRAIN_STATUS_LABELS,
  ERROR_TAXONOMY_LABELS,
} from "@/lib/coach-labels"
import type { BrainDetailTopicRow } from "@/lib/ai/brain-detail"
import PerformanceStackBar from "@/components/questions/PerformanceStackBar"
import { brainStatusBadgeClass } from "./brain-status-styles"
import BrainTopicQuestionsPanel from "./BrainTopicQuestionsPanel"

const STATUS_CHART_COLORS: Record<string, string> = {
  dominado: "#22c55e",
  forte: "#4ade80",
  instavel: "#f59e0b",
  fraco: "#f97316",
  critico: "#ef4444",
  ilusao_dominio: "#8b5cf6",
  em_evolucao: "#94a3b8",
  sem_dados: "#cbd5e1",
}

type SortKey = "name" | "dominio" | "estabilidade" | "alert"

type Props = {
  userId: string
  subjectId: string
  topics: BrainDetailTopicRow[]
  statusDistribution: { status: string; count: number }[]
}

export default function BrainTopicMap({
  userId,
  subjectId,
  topics,
  statusDistribution,
}: Props) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sortKey, setSortKey] = useState<SortKey>("alert")
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let rows = [...topics]
    if (statusFilter !== "all") {
      rows = rows.filter((t) => t.status === statusFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter((t) => t.label.toLowerCase().includes(q))
    }
    rows.sort((a, b) => {
      if (sortKey === "name") return a.label.localeCompare(b.label, "pt-BR")
      if (sortKey === "dominio") return a.dominio - b.dominio
      if (sortKey === "estabilidade") return a.estabilidade - b.estabilidade
      if (a.is_danger !== b.is_danger) return a.is_danger ? -1 : 1
      return a.dominio - b.dominio
    })
    return rows
  }, [topics, statusFilter, search, sortKey])

  const chartData = statusDistribution
    .filter((s) => s.count > 0)
    .map((s) => ({
      name: BRAIN_STATUS_LABELS[s.status] ?? s.status,
      value: s.count,
      fill: STATUS_CHART_COLORS[s.status] ?? "#94a3b8",
    }))

  const statusOptions = [
    "all",
    ...new Set(topics.map((t) => t.status)),
  ]

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
        Mapa por assunto
      </h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-[200px_1fr]">
        {chartData.length > 0 && (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={65}
                >
                  {chartData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Buscar assunto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[160px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "Todos os status" : BRAIN_STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="alert">Alertas primeiro</option>
            <option value="dominio">Menor domínio</option>
            <option value="estabilidade">Menor estabilidade</option>
            <option value="name">Nome</option>
          </select>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600">
              <th className="w-8 px-2 py-2" />
              <th className="px-2 py-2">Assunto</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Domínio</th>
              <th className="px-2 py-2">Estab.</th>
              <th className="px-2 py-2">Resolvidas</th>
              <th className="px-2 py-2 min-w-[140px]">Desempenho</th>
              <th className="px-2 py-2">Insight / erro</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const expanded = expandedKey === t.topic_key
              return (
                <Fragment key={t.topic_key}>
                  <tr
                    className={`border-t border-slate-100 ${t.is_danger ? "bg-red-50/40" : ""}`}
                  >
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedKey(expanded ? null : t.topic_key)
                        }
                        className="text-slate-500 hover:text-slate-800"
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-2 py-2 font-medium text-slate-900">
                      {t.label}
                      {t.dominio_delta != null && (
                        <span
                          className={`ml-1 text-xs ${
                            t.dominio_delta > 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          ({t.dominio_delta > 0 ? "+" : ""}
                          {Math.round(t.dominio_delta * 100)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${brainStatusBadgeClass(t.status)}`}
                      >
                        {BRAIN_STATUS_LABELS[t.status] ?? t.status}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {Math.round(t.dominio * 100)}%
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {Math.round(t.estabilidade * 100)}%
                    </td>
                    <td className="px-2 py-2 tabular-nums text-center">
                      {t.total_attempts}
                    </td>
                    <td className="px-2 py-2">
                      {t.total_attempts > 0 ? (
                        <PerformanceStackBar
                          correct={t.correct}
                          wrong={t.wrong}
                          showText={false}
                        />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="max-w-xs px-2 py-2 text-xs text-slate-600">
                      {t.last_insight ? (
                        <span title={t.last_insight}>
                          {t.last_insight.slice(0, 100)}
                          {t.last_insight.length > 100 ? "…" : ""}
                        </span>
                      ) : t.predominant_error ? (
                        ERROR_TAXONOMY_LABELS[t.predominant_error]
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <BrainTopicQuestionsPanel
                          userId={userId}
                          subjectId={subjectId}
                          topicKey={t.topic_key}
                          topicLabel={t.label}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">
            Nenhum tópico com os filtros atuais.
          </p>
        )}
      </div>
    </section>
  )
}
