"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Loader2, Play } from "lucide-react"
import type { LearningSignal } from "@/lib/coach-types"

const SIGNAL_LABELS: Record<string, string> = {
  high_recurrence: "Alta reincidência",
  consolidated: "Consolidado",
  false_positive_pattern: "Falso positivo recorrente",
  slow_struggle: "Lentidão + insegurança",
  fast_guess_wrong: "Chute rápido errado",
  time_improving: "Tempo melhorando",
}

export default function CoachInsightsPage() {
  const params = useParams()
  const subjectId = params.subjectId as string
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [subjectName, setSubjectName] = useState("")
  const [signals, setSignals] = useState<LearningSignal[]>([])
  const [topicStats, setTopicStats] = useState<
    { topic: string; correct: number; wrong: number; avg_duration_ms: number }[]
  >([])
  const [reports, setReports] = useState<
    {
      id: string
      summary_md: string | null
      structured: { headline?: string; executable_actions?: { label: string; type: string; params: Record<string, unknown> }[] }
      notebooks: { name: string } | null
    }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [creatingNb, setCreatingNb] = useState(false)

  function reload(uid: string) {
    setLoading(true)
    Promise.all([
      fetch(`/api/subjects?user_id=${uid}`).then((r) => r.json()),
      fetch(
        `/api/coach/signals?user_id=${uid}&subject_id=${subjectId}&refresh=1`
      ).then((r) => r.json()),
      fetch(`/api/coach/reports?user_id=${uid}&subject_id=${subjectId}`).then(
        (r) => r.json()
      ),
    ])
      .then(([subs, sig, reps]) => {
        const sub = (subs ?? []).find((s: { id: string }) => s.id === subjectId)
        setSubjectName(sub?.name ?? "Matéria")
        setSignals(sig.signals ?? [])
        setTopicStats(sig.topic_stats ?? [])
        setReports(reps ?? [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      reload(user.id)
    })
  }, [subjectId, router])

  async function createRemediationNotebook(
    params: Record<string, unknown>,
    label: string
  ) {
    if (!userId) return
    setCreatingNb(true)
    const res = await fetch("/api/notebooks/from-performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        name: (params.suggested_name as string) ?? label,
        subject_id: subjectId,
        rules: {
          source_notebook_id: params.source_notebook_id,
          tec_topics: params.tec_topics,
          min_wrong_attempts: params.min_wrong_attempts ?? 1,
          wrong_only: true,
        },
      }),
    })
    const data = await res.json()
    setCreatingNb(false)
    if (data.notebook_id) router.push(`/questoes/cadernos/${data.notebook_id}`)
    else alert(data.error ?? "Erro ao criar caderno")
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando insights…
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <Link
        href="/coach/materias"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Matérias
      </Link>

      <h2 className="text-xl font-bold text-slate-900">{subjectName}</h2>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Prioridades (SQL)
        </h3>
        {!signals.length ? (
          <p className="text-sm text-slate-500">
            Resolva questões mapeadas para esta matéria para gerar sinais.
          </p>
        ) : (
          <ul className="space-y-2">
            {signals.slice(0, 12).map((s, i) => (
              <li
                key={`${s.signal_type}-${s.entity_id}-${i}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium text-slate-900">
                    {SIGNAL_LABELS[s.signal_type] ?? s.signal_type}
                  </span>
                  <span className="text-slate-500">
                    {" "}
                    · {s.entity_type === "tec_topic" ? s.entity_id : "questão"}
                  </span>
                </span>
                <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                  {Math.round(s.score)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Desempenho por tópico TEC
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Tópico</th>
                <th className="px-3 py-2">Acertos</th>
                <th className="px-3 py-2">Erros</th>
                <th className="px-3 py-2">Tempo médio</th>
              </tr>
            </thead>
            <tbody>
              {topicStats
                .sort((a, b) => b.wrong - a.wrong)
                .slice(0, 15)
                .map((t) => (
                  <tr key={t.topic} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{t.topic}</td>
                    <td className="px-3 py-2 text-green-700">{t.correct}</td>
                    <td className="px-3 py-2 text-red-700">{t.wrong}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {t.avg_duration_ms
                        ? `${Math.round(t.avg_duration_ms / 1000)}s`
                        : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Relatórios de cadernos
        </h3>
        {!reports.length ? (
          <p className="text-sm text-slate-500">
            Nenhum relatório ainda. Conclua um caderno desta matéria.
          </p>
        ) : (
          <ul className="space-y-4">
            {reports.map((r) => {
              const nb = r.notebooks as { name: string } | { name: string }[] | null
              const nbName = Array.isArray(nb) ? nb[0]?.name : nb?.name
              const actions = r.structured?.executable_actions ?? []
              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <Link
                    href={`/coach/relatorios/${r.id}`}
                    className="font-medium text-violet-800 hover:underline"
                  >
                    {nbName ?? "Caderno"} —{" "}
                    {r.structured?.headline ?? "Relatório"} →
                  </Link>
                  {r.summary_md && (
                    <p className="mt-2 line-clamp-4 text-sm text-slate-600 whitespace-pre-wrap">
                      {r.summary_md.slice(0, 400)}
                      {r.summary_md.length > 400 ? "…" : ""}
                    </p>
                  )}
                  {actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {actions.map((a, i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={creatingNb}
                          onClick={() =>
                            createRemediationNotebook(a.params, a.label)
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" />
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/questoes/materia/${subjectId}`}
          className="text-sm font-medium text-violet-700 hover:underline"
        >
          Ver cadernos desta matéria →
        </Link>
        <Link
          href={`/erros?subject=${subjectId}`}
          className="text-sm font-medium text-violet-700 hover:underline"
        >
          Mapa de erros →
        </Link>
        <Link
          href="/flashcards"
          className="text-sm font-medium text-violet-700 hover:underline"
        >
          Flashcards →
        </Link>
      </div>
    </div>
  )
}
