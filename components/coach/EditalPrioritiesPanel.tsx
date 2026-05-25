"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Sparkles, ChevronDown, ChevronRight } from "lucide-react"
import type { ExamPlanStructured } from "@/lib/coach-types"

type AnalysisRow = {
  id: string
  structure?: { subjects?: { name: string; edital_weight?: string }[] }
  priorities?: ExamPlanStructured
  model_used?: string
  analyzed_at?: string
}

export default function EditalPrioritiesPanel({
  userId,
  examTargetId,
  examName,
  hasEdital,
  hasIncidence,
}: {
  userId: string
  examTargetId: string
  examName: string
  hasEdital: boolean
  hasIncidence: boolean
}) {
  const [analysis, setAnalysis] = useState<AnalysisRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    setLoading(true)
    fetch(
      `/api/coach/exam-targets/${examTargetId}/analyze-edital?user_id=${userId}`
    )
      .then((r) => r.json())
      .then((d) => {
        setAnalysis(d.analysis ?? null)
      })
      .finally(() => setLoading(false))
  }, [userId, examTargetId])

  useEffect(() => {
    load()
  }, [load])

  async function runAnalysis() {
    if (!hasEdital) {
      alert("Envie o PDF do edital antes de analisar.")
      return
    }
    setAnalyzing(true)
    try {
      const res = await fetch(
        `/api/coach/exam-targets/${examTargetId}/analyze-edital`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        }
      )
      const data = await res.json()
      if (data.error) alert(data.error)
      else {
        load()
        alert(
          `Análise concluída com ${data.model_used ?? "IA"}. Veja as prioridades abaixo.`
        )
      }
    } catch {
      alert("Falha na análise do edital.")
    } finally {
      setAnalyzing(false)
    }
  }

  const priorities = analysis?.priorities as ExamPlanStructured | undefined
  const rank = priorities?.subject_priority_rank ?? []
  const matrix = priorities?.topic_matrix ?? []

  function toggleSubject(name: string) {
    setOpenSubjects((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const topicsBySubject = new Map<string, typeof matrix>()
  for (const row of matrix) {
    const sub = (row.subject ?? "").trim()
    if (!sub) continue
    const list = topicsBySubject.get(sub) ?? []
    list.push(row)
    topicsBySubject.set(sub, list)
  }

  return (
    <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Prioridades do edital
          </h3>
          <p className="text-sm text-slate-600">
            Cruza o edital de <strong>{examName}</strong> com a incidência
            histórica (gpt-4o). Só matérias presentes no edital entram na
            análise.
          </p>
          {analysis?.model_used && (
            <p className="mt-1 text-xs text-slate-500">
              Última análise: {analysis.model_used}
              {analysis.analyzed_at &&
                ` · ${new Date(analysis.analyzed_at).toLocaleString("pt-BR")}`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={analyzing || !hasEdital}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {analyzing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Analisar edital com IA (gpt-4o)
        </button>
      </div>

      {!hasEdital && (
        <p className="text-sm text-amber-800">
          Envie o PDF do edital para habilitar a análise.
        </p>
      )}
      {hasEdital && !hasIncidence && (
        <p className="text-sm text-amber-800">
          Envie também o Excel de incidência para cruzar com o edital.
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando análise…
        </div>
      ) : !rank.length ? (
        <div className="rounded-lg border border-dashed border-amber-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-600">
          {hasEdital && hasIncidence
            ? "Clique em “Analisar edital com IA” para gerar a ordem de prioridades e o porquê de cada matéria."
            : "Envie PDF + Excel e clique em analisar."}
        </div>
      ) : (
        <div className="space-y-3">
          {priorities?.headline && (
            <p className="rounded-lg bg-white px-4 py-3 text-sm font-medium text-slate-800">
              {priorities.headline}
            </p>
          )}
          {rank.map((item) => {
            const subName = item.subject_name ?? ""
            const open = openSubjects.has(subName)
            const topics = topicsBySubject.get(subName) ?? []
            return (
              <div
                key={subName}
                className="overflow-hidden rounded-xl border border-amber-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggleSubject(subName)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-amber-50/50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-600 text-sm font-bold text-white">
                    {item.priority ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{subName}</p>
                    <p className="text-xs text-slate-600 line-clamp-2">
                      {item.why}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Peso edital: {item.edital_weight ?? "—"} · Incidência:{" "}
                      {item.incidence_summary ?? "—"}
                    </p>
                  </div>
                  {open ? (
                    <ChevronDown className="h-5 w-5 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  )}
                </button>
                {open && topics.length > 0 && (
                  <div className="border-t border-amber-100 px-4 pb-4">
                    <table className="mt-2 w-full text-sm">
                      <thead className="text-left text-xs text-slate-500">
                        <tr>
                          <th className="py-1 pr-2">Assunto</th>
                          <th className="py-1 pr-2">Incidência</th>
                          <th className="py-1">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topics.map((t, i) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="py-2 pr-2 font-medium text-slate-800">
                              {t.topic}
                            </td>
                            <td className="py-2 pr-2 text-emerald-700">
                              {t.incidence_percent != null
                                ? `${Number(t.incidence_percent).toFixed(1)}%`
                                : t.incidence_hint ?? "—"}
                              {t.incidence_quantity != null && (
                                <span className="text-slate-400">
                                  {" "}
                                  ({t.incidence_quantity} quest.)
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-xs text-slate-600">
                              {t.action ?? t.your_gap ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
