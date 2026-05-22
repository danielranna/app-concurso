"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

type Props = {
  questionId: string
  userId: string
  onClose: () => void
}

export default function PerformanceModal({ questionId, userId, onClose }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/questions/${questionId}/performance?user_id=${userId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [questionId, userId])

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="rounded-lg bg-white p-8">Carregando...</div>
      </div>
    )
  }

  const global = data?.global as {
    total_resolutions: number
    correct_pct: number
    error_pct: number
    difficulty: string
    avg_duration_ms: number | null
    alternative_distribution: { label: string; pct: number; is_correct: boolean }[]
  }
  const mine = data?.mine as {
    total_resolutions: number
    correct_pct: number
    error_pct: number
    history: {
      date: string
      is_correct: boolean
      selected_answer: string
      duration_ms: number | null
      outcome_label?: string
    }[]
    outcome_breakdown?: { label: string; count: number; pct: number }[]
  }

  const globalPie = [
    { name: "Acertos", value: global?.correct_pct ?? 0, color: "#22c55e" },
    { name: "Erros", value: global?.error_pct ?? 0, color: "#ef4444" },
  ]
  const minePie = [
    { name: "Acertos", value: mine?.correct_pct ?? 0, color: "#22c55e" },
    { name: "Erros", value: mine?.error_pct ?? 0, color: "#ef4444" },
  ]

  const formatMs = (ms: number | null) => {
    if (!ms) return "—"
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${String(m).padStart(2, "0")}m${String(s % 60).padStart(2, "0")}s`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Desempenho nesta questão</h2>
          <button type="button" onClick={onClose} className="text-red-600 font-medium">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-3">
          <section>
            <h3 className="mb-3 font-medium text-slate-700">Desempenho geral</h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={globalPie} dataKey="value" innerRadius={40} outerRadius={60}>
                    {globalPie.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-green-600">Acertos: {global?.correct_pct?.toFixed(1)}%</p>
            <p className="text-sm text-red-600">Erros: {global?.error_pct?.toFixed(1)}%</p>
            <p className="mt-2 text-sm">Dificuldade: {global?.difficulty}</p>
            <p className="text-sm">Total: {global?.total_resolutions ?? 0}</p>
            <p className="text-sm">Tempo médio: {formatMs(global?.avg_duration_ms ?? null)}</p>
          </section>
          <section>
            <h3 className="mb-3 font-medium text-slate-700">Alternativas marcadas</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={global?.alternative_distribution ?? []}
                  layout="vertical"
                  margin={{ left: 24 }}
                >
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis type="category" dataKey="label" width={40} />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                  <Bar dataKey="pct">
                    {(global?.alternative_distribution ?? []).map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.is_correct ? "#22c55e" : "#ef4444"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section>
            <h3 className="mb-3 font-medium text-slate-700">Meu desempenho</h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={minePie} dataKey="value" innerRadius={40} outerRadius={60}>
                    {minePie.map((e, i) => (
                      <Cell key={i} fill={e.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm">Total: {mine?.total_resolutions ?? 0}</p>
            {(mine?.outcome_breakdown?.length ?? 0) > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {mine.outcome_breakdown!.map((o) => (
                  <li key={o.label}>
                    {o.label}: {o.count} ({o.pct.toFixed(0)}%)
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-slate-600">
              {(mine?.history ?? []).map((h, i) => (
                <li key={i}>
                  {new Date(h.date).toLocaleDateString("pt-BR")} —{" "}
                  {h.is_correct ? "Acertou" : "Errou"} — {h.selected_answer}{" "}
                  {formatMs(h.duration_ms)}
                  {h.outcome_label ? ` · ${h.outcome_label}` : ""}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
