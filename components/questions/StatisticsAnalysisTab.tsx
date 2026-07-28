"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import ErrorDistributionChart from "@/components/questions/ErrorDistributionChart"
import WeakTopicsRanking from "@/components/questions/WeakTopicsRanking"
import StatsTrendChart from "@/components/questions/StatsTrendChart"
import ErrorMetaCharts from "@/components/questions/ErrorMetaCharts"
import AnalysisQuestionPanel from "@/components/questions/AnalysisQuestionPanel"
import { SequencePatternBadge } from "@/components/questions/SequencePatternBadge"
import { cn } from "@/lib/utils"
import type { StatsPeriod } from "@/lib/question-statistics"
import type {
  AnalysisQuestionRow,
  QuestionStatisticsAnalysisResult,
} from "@/lib/question-statistics-analysis"
import {
  SEQUENCE_PATTERN_LABELS,
  type SequencePattern,
} from "@/lib/question-sequence-pattern"

type TopicFilter = { subject_id: string | null; topic: string } | null

type Props = {
  userId: string
  period: StatsPeriod
  selectedSubjects: Set<string>
  allSubjects: { id: string; name: string }[]
}

const PATTERN_CARDS: {
  key: SequencePattern
  hint: string
  activeClass: string
  idleClass: string
  btnClass: string
}[] = [
  {
    key: "confusao",
    hint: "Oscila entre acerto e erro.",
    activeClass: "border-amber-300 bg-amber-50 ring-1 ring-amber-200",
    idleClass: "border-amber-100 bg-amber-50/40 hover:border-amber-200",
    btnClass: "bg-amber-600 hover:bg-amber-700",
  },
  {
    key: "aprendizado",
    hint: "Errou e depois consolidou acertos.",
    activeClass: "border-teal-300 bg-teal-50 ring-1 ring-teal-200",
    idleClass: "border-teal-100 bg-teal-50/40 hover:border-teal-200",
    btnClass: "bg-teal-600 hover:bg-teal-700",
  },
  {
    key: "esquecimento",
    hint: "Consolida e depois erra de novo.",
    activeClass: "border-rose-300 bg-rose-50 ring-1 ring-rose-200",
    idleClass: "border-rose-100 bg-rose-50/40 hover:border-rose-200",
    btnClass: "bg-rose-600 hover:bg-rose-700",
  },
]

export default function StatisticsAnalysisTab({
  userId,
  period,
  selectedSubjects,
  allSubjects,
}: Props) {
  const router = useRouter()
  const [data, setData] = useState<QuestionStatisticsAnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [topicFilter, setTopicFilter] = useState<TopicFilter>(null)
  const [patternFilter, setPatternFilter] = useState<SequencePattern | null>(null)
  const [selected, setSelected] = useState<AnalysisQuestionRow | null>(null)
  const [practicing, setPracticing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ user_id: userId, period })
    if (
      allSubjects.length > 0 &&
      selectedSubjects.size > 0 &&
      selectedSubjects.size < allSubjects.length
    ) {
      params.set("subject_ids", [...selectedSubjects].join(","))
    }
    try {
      const res = await fetch(`/api/questions/statistics/analysis?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar análise")
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [userId, period, selectedSubjects, allSubjects.length])

  useEffect(() => {
    if (allSubjects.length > 0 && selectedSubjects.size === 0) {
      setData(null)
      setLoading(false)
      return
    }
    void load()
  }, [load, allSubjects.length, selectedSubjects.size])

  useEffect(() => {
    setTopicFilter(null)
    setPatternFilter(null)
    setSelected(null)
  }, [period, selectedSubjects])

  const filteredQuestions = useMemo(() => {
    if (!data) return []
    return data.questions.filter((q) => {
      if (
        topicFilter &&
        (q.tec_topic !== topicFilter.topic ||
          q.subject_id !== topicFilter.subject_id)
      ) {
        return false
      }
      if (patternFilter && q.sequence_pattern !== patternFilter) return false
      return true
    })
  }, [data, topicFilter, patternFilter])

  const createPracticeNotebook = useCallback(
    async (questionIds: string[], name: string, subjectId: string) => {
      if (!questionIds.length) return
      setPracticing(true)
      try {
        const res = await fetch("/api/notebooks/from-performance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            name,
            subject_id: subjectId,
            question_ids: questionIds,
            library_saved: false,
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.notebook_id) {
          alert(json.error ?? "Não foi possível criar o caderno")
          return
        }
        router.push(`/questoes/cadernos/${json.notebook_id}`)
      } finally {
        setPracticing(false)
      }
    },
    [userId, router]
  )

  const practiceBySubjectMap = useCallback(
    async (
      items: Array<{ question_id: string; subject_id: string | null }>,
      label: string
    ) => {
      if (!items.length) {
        alert("Nenhuma questão para praticar com esses filtros.")
        return
      }
      const bySubject = new Map<string, string[]>()
      for (const item of items) {
        if (!item.subject_id) continue
        const list = bySubject.get(item.subject_id) ?? []
        list.push(item.question_id)
        bySubject.set(item.subject_id, list)
      }
      let bestSubject: string | null = null
      let bestIds: string[] = []
      for (const [sid, list] of bySubject) {
        if (list.length > bestIds.length) {
          bestSubject = sid
          bestIds = list
        }
      }
      if (!bestSubject || !bestIds.length) {
        alert(
          "As questões selecionadas não têm matéria vinculada. Associe matérias para praticar."
        )
        return
      }
      await createPracticeNotebook(bestIds.slice(0, 20), label, bestSubject)
    },
    [createPracticeNotebook]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando análise…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    )
  }

  if (!data || data.questions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
        Nenhum erro no período e filtros selecionados para analisar.
      </div>
    )
  }

  const sp = data.sequence_patterns ?? {
    confusao: 0,
    aprendizado: 0,
    esquecimento: 0,
    questions_by_pattern: {
      confusao: [],
      aprendizado: [],
      esquecimento: [],
    },
  }

  const criticalCount =
    data.critical_gaps?.length ?? data.critical_gap_question_ids.length
  const top20 = filteredQuestions.slice(0, 20).map((q) => ({
    question_id: q.question_id,
    subject_id: q.subject_id,
  }))

  const filterHints = [
    topicFilter ? topicFilter.topic : null,
    patternFilter ? SEQUENCE_PATTERN_LABELS[patternFilter] : null,
  ].filter(Boolean)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-red-100 bg-red-50/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-red-700">
            Lacunas críticas
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-red-800">
            {criticalCount}
          </p>
          <p className="mt-1 text-xs text-red-700/80">
            Marcou “seguro” e errou — prioridade alta.
          </p>
          <button
            type="button"
            disabled={practicing || criticalCount === 0}
            onClick={() =>
              void practiceBySubjectMap(
                data.critical_gaps ??
                  data.critical_gap_question_ids.map((id) => ({
                    question_id: id,
                    subject_id:
                      data.questions.find((q) => q.question_id === id)
                        ?.subject_id ?? null,
                  })),
                "Prática — lacunas críticas"
              )
            }
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {practicing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Praticar lacunas críticas
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Concentração de erros
          </p>
          {data.pareto.topic_count > 0 ? (
            <>
              <p className="mt-1 text-sm text-slate-800">
                <span className="font-semibold">
                  {data.pareto.topic_count} assunto
                  {data.pareto.topic_count > 1 ? "s" : ""}
                </span>{" "}
                concentra
                {data.pareto.topic_count > 1 ? "m" : ""}{" "}
                <span className="font-semibold text-teal-700">
                  {data.pareto.error_share_pct}%
                </span>{" "}
                dos seus erros:
              </p>
              <ul className="mt-2 list-inside list-disc text-xs text-slate-600">
                {data.pareto.topics.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Sem erros para calcular.</p>
          )}
          <button
            type="button"
            disabled={practicing || top20.length === 0}
            onClick={() =>
              void practiceBySubjectMap(top20, "Prática — top mais erradas")
            }
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-teal-600 px-3 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {practicing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Praticar top {Math.min(20, top20.length)} mais erradas
            {filterHints.length ? " (filtro)" : ""}
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">Padrões de sequência</h2>
            <p className="text-xs text-slate-500">
              Heurística sobre o histórico acerto/erro (mín. 4 tentativas). Clique
              para filtrar.
            </p>
          </div>
          {patternFilter && (
            <button
              type="button"
              onClick={() => setPatternFilter(null)}
              className="text-xs font-medium text-teal-700 hover:underline"
            >
              Limpar padrão
            </button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {PATTERN_CARDS.map((card) => {
            const count = sp[card.key]
            const isActive = patternFilter === card.key
            const list = sp.questions_by_pattern?.[card.key] ?? []
            return (
              <div
                key={card.key}
                className={cn(
                  "rounded-xl border p-3 transition",
                  isActive ? card.activeClass : card.idleClass
                )}
              >
                <button
                  type="button"
                  onClick={() => setPatternFilter(isActive ? null : card.key)}
                  className="w-full text-left"
                >
                  <p className="text-xs font-medium text-slate-600">
                    {SEQUENCE_PATTERN_LABELS[card.key]}
                  </p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
                    {count}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
                </button>
                {list.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-black/5 pt-2">
                    {list.slice(0, 3).map((q) => (
                      <li key={q.question_id}>
                        <button
                          type="button"
                          onClick={() => setSelected(q)}
                          className="line-clamp-1 w-full text-left text-xs text-slate-600 hover:text-slate-900"
                        >
                          <span className="font-mono text-[10px] text-slate-400">
                            {q.sequence_preview}
                          </span>{" "}
                          · {q.statement_preview.slice(0, 48) || "…"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  disabled={practicing || count === 0}
                  onClick={() =>
                    void practiceBySubjectMap(
                      (sp.questions_by_pattern?.[card.key] ?? []).map((q) => ({
                        question_id: q.question_id,
                        subject_id: q.subject_id,
                      })),
                      `Prática — ${SEQUENCE_PATTERN_LABELS[card.key].toLowerCase()}`
                    )
                  }
                  className={cn(
                    "mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-white disabled:opacity-50",
                    card.btnClass
                  )}
                >
                  {practicing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Praticar
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-3">
          <h2 className="mb-1 font-semibold text-slate-900">
            Distribuição de erros por questão
          </h2>
          {filterHints.length > 0 && (
            <p className="mb-2 text-xs text-teal-700">
              Filtrado: {filterHints.join(" · ")}
            </p>
          )}
          <ErrorDistributionChart
            questions={filteredQuestions}
            onSelect={setSelected}
            selectedId={selected?.question_id}
          />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-1 font-semibold text-slate-900">
            Pontos fracos (assunto)
          </h2>
          <WeakTopicsRanking
            topics={data.weak_topics}
            selected={topicFilter}
            onSelect={setTopicFilter}
          />
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 font-semibold text-slate-900">Tendência no tempo</h2>
        <p className="mb-3 text-xs text-slate-500">
          Acertos e erros por período, com % de acerto.
        </p>
        <StatsTrendChart trend={data.trend} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-slate-900">
          Tipos de erro e metacognição
        </h2>
        <ErrorMetaCharts taxonomy={data.taxonomy} outcomes={data.outcomes} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-900">
            Ranking de questões mais erradas
            {filterHints.length ? " (filtrado)" : ""}
          </h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {filteredQuestions.slice(0, 25).map((q, i) => (
            <li key={q.question_id}>
              <button
                type="button"
                onClick={() => setSelected(q)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
              >
                <span className="w-6 shrink-0 text-xs tabular-nums text-slate-400">
                  {i + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-slate-800">
                    {q.statement_preview || "Sem enunciado"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <SequencePatternBadge pattern={q.sequence_pattern} />
                    {q.sequence_preview ? (
                      <span className="font-mono text-[10px] text-slate-400">
                        {q.sequence_preview}
                      </span>
                    ) : null}
                    <span className="text-xs text-slate-500">
                      {q.subject_name} · {q.tec_topic}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-red-600">
                  {q.wrong_count}×
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <AnalysisQuestionPanel
          question={selected}
          userId={userId}
          onClose={() => setSelected(null)}
          onPractice={createPracticeNotebook}
          practicing={practicing}
        />
      )}
    </div>
  )
}
