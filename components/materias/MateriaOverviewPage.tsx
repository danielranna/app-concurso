"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { BrainDetailPayload } from "@/lib/ai/brain-detail"
import BrainOverviewCards from "@/components/coach/brain/BrainOverviewCards"
import PerformanceStackBar from "@/components/questions/PerformanceStackBar"
import { BRAIN_STATUS_LABELS } from "@/lib/coach-labels"
import type { QuestionStatisticsResult } from "@/lib/question-statistics"

type Props = {
  subjectId: string
}

const STRONG = new Set(["dominado", "forte"])
const WEAK = new Set(["fraco", "critico", "ilusao_dominio", "instavel"])

export default function MateriaOverviewPage({ subjectId }: Props) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<QuestionStatisticsResult | null>(null)
  const [brain, setBrain] = useState<BrainDetailPayload | null>(null)

  const load = useCallback(async (uid: string) => {
    setLoading(true)
    const [statsRes, brainRes] = await Promise.all([
      fetch(`/api/questions/statistics?user_id=${uid}&subject_ids=${subjectId}`),
      fetch(`/api/coach/brain/detail?user_id=${uid}&subject_id=${subjectId}`),
    ])
    const statsJson = await statsRes.json()
    const brainJson = await brainRes.json()
    if (!statsJson.error) setStats(statsJson)
    if (!brainJson.error) setBrain(brainJson as BrainDetailPayload)
    setLoading(false)
  }, [subjectId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) load(user.id)
    })
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando visão geral…
      </div>
    )
  }

  const subjectRow = stats?.by_subject.find((s) => s.id === subjectId)
  const strongTopics =
    brain?.topics.filter((t) => STRONG.has(t.status)).slice(0, 8) ?? []
  const weakTopics =
    brain?.topics.filter((t) => WEAK.has(t.status)).slice(0, 8) ?? []

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
          Desempenho em questões
        </h2>
        {subjectRow && subjectRow.total > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap gap-4 text-sm">
              <span>
                <strong className="text-slate-900">{subjectRow.total}</strong> resoluções
              </span>
              <span className="text-green-700">{subjectRow.correct} acertos</span>
              <span className="text-red-600">{subjectRow.wrong} erros</span>
              <span className="text-slate-600">
                {Math.round(subjectRow.correct_pct)}% de acerto
              </span>
            </div>
            <PerformanceStackBar
              correct={subjectRow.correct}
              wrong={subjectRow.wrong}
              showText
            />
            {subjectRow.topics.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="py-2 pr-4">Assunto</th>
                      <th className="py-2 pr-4">Acertos</th>
                      <th className="py-2 pr-4">Erros</th>
                      <th className="py-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectRow.topics.map((t) => (
                      <tr key={t.name} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium text-slate-800">{t.name}</td>
                        <td className="py-2 pr-4 text-green-700">{t.correct}</td>
                        <td className="py-2 pr-4 text-red-600">{t.wrong}</td>
                        <td className="py-2 tabular-nums">{Math.round(t.correct_pct)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Ainda não há tentativas de questões nesta matéria.
          </p>
        )}
      </section>

      {brain && (
        <>
          <BrainOverviewCards overview={brain.overview} />
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-green-200 bg-green-50/50 p-4">
              <h3 className="mb-2 font-semibold text-green-900">Onde estou bem</h3>
              {strongTopics.length === 0 ? (
                <p className="text-sm text-green-800/80">Nenhum tópico forte ainda.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {strongTopics.map((t) => (
                    <li key={t.topic_key} className="flex justify-between gap-2">
                      <span className="text-slate-800">{t.label}</span>
                      <span className="shrink-0 text-green-700">
                        {BRAIN_STATUS_LABELS[t.status] ?? t.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
              <h3 className="mb-2 font-semibold text-red-900">Onde preciso melhorar</h3>
              {weakTopics.length === 0 ? (
                <p className="text-sm text-red-800/80">Nenhum ponto crítico no momento.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {weakTopics.map((t) => (
                    <li key={t.topic_key} className="flex justify-between gap-2">
                      <span className="text-slate-800">{t.label}</span>
                      <span className="shrink-0 text-red-700">
                        {BRAIN_STATUS_LABELS[t.status] ?? t.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
