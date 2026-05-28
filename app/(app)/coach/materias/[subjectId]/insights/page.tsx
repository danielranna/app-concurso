"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  Sparkles,
  RefreshCw,
} from "lucide-react"
import StrategicQueueList, {
  type BrainTopicHint,
  type QueueItem,
} from "@/components/coach/StrategicQueueList"
import type { LearningSignal, SubjectBrainState } from "@/lib/coach-types"
import {
  BRAIN_STATUS_LABELS,
  ERROR_TAXONOMY_LABELS,
  SIGNAL_LABELS,
} from "@/lib/coach-labels"

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
  const [priorities, setPriorities] = useState<{
    narrative_summary?: string
    top_priorities?: {
      rank: number
      title: string
      why: string
      domain: string
      time_minutes: number
    }[]
    executable_actions?: {
      label: string
      type: string
      params: Record<string, unknown>
    }[]
  } | null>(null)
  const [loadingPriorities, setLoadingPriorities] = useState(false)
  const [brain, setBrain] = useState<SubjectBrainState | null>(null)
  const [brainSummary, setBrainSummary] = useState<string | null>(null)
  const [brainLastReportId, setBrainLastReportId] = useState<string | null>(null)
  const [recomputingBrain, setRecomputingBrain] = useState(false)
  const [queueItems, setQueueItems] = useState<QueueItem[]>([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [explainMode, setExplainMode] = useState<"global" | "on" | "off">("global")
  const [savingExplain, setSavingExplain] = useState(false)
  const [brainTableExpanded, setBrainTableExpanded] = useState(false)

  const brainByTopic: Record<string, BrainTopicHint> | undefined = brain
    ? Object.fromEntries(
        Object.entries(brain.topic_map).map(([key, entry]) => [
          key,
          {
            last_insight: entry.last_insight,
            predominant_error: entry.predominant_error,
            status: entry.status,
          },
        ])
      )
    : undefined

  const brainTopicRows = brain
    ? Object.entries(brain.topic_map).sort((a, b) => {
        const aInsight = a[1].last_insight ? 1 : 0
        const bInsight = b[1].last_insight ? 1 : 0
        if (bInsight !== aInsight) return bInsight - aInsight
        return a[1].dominio - b[1].dominio
      })
    : []
  const BRAIN_TABLE_TOP = 5
  const visibleBrainRows =
    brainTableExpanded || brainTopicRows.length <= BRAIN_TABLE_TOP
      ? brainTopicRows
      : brainTopicRows.slice(0, BRAIN_TABLE_TOP)

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
      fetch(`/api/coach/brain?user_id=${uid}&subject_id=${subjectId}`).then(
        (r) => r.json()
      ),
      fetch(`/api/coach/strategic-queue?user_id=${uid}&subject_id=${subjectId}`).then(
        (r) => r.json()
      ),
      fetch(
        `/api/coach/preferences/subject?user_id=${uid}&subject_id=${subjectId}`
      ).then((r) => r.json()),
    ])
      .then(([subs, sig, reps, brainRes, queueRes, explainRes]) => {
        const sub = (subs ?? []).find((s: { id: string }) => s.id === subjectId)
        setSubjectName(sub?.name ?? "Matéria")
        setSignals(sig.signals ?? [])
        setTopicStats(sig.topic_stats ?? [])
        setReports(reps ?? [])
        setBrain(brainRes.state ?? null)
        setBrainSummary(brainRes.summary_md ?? null)
        setBrainLastReportId(brainRes.last_report_id ?? null)
        setQueueItems(
          (queueRes.items ?? []).map(
            (i: {
              id: string
              topic_key: string
              topic_label?: string
              priority_score: number
              incidence_weight?: number
              edital_weight?: number
              gap_score?: number
              retention_penalty?: number
              reason?: string
            }) => ({
              id: i.id,
              topic_key: i.topic_key,
              topic_label: i.topic_label,
              priority_score: Number(i.priority_score),
              incidence_weight: i.incidence_weight,
              edital_weight: i.edital_weight != null ? Number(i.edital_weight) : undefined,
              gap_score: i.gap_score,
              retention_penalty: i.retention_penalty,
              reason: i.reason,
            })
          )
        )
        if (explainRes?.explain_wrong === null || explainRes?.explain_wrong === undefined) {
          setExplainMode("global")
        } else if (explainRes.explain_wrong) {
          setExplainMode("on")
        } else {
          setExplainMode("off")
        }
      })
      .finally(() => setLoading(false))
  }

  async function saveExplainMode(mode: "global" | "on" | "off") {
    if (!userId) return
    setSavingExplain(true)
    setExplainMode(mode)
    const explain_wrong =
      mode === "global" ? null : mode === "on"
    await fetch("/api/coach/preferences/subject", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        subject_id: subjectId,
        explain_wrong,
      }),
    })
    setSavingExplain(false)
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

  async function refreshQueue() {
    if (!userId) return
    setLoadingQueue(true)
    const res = await fetch("/api/coach/strategic-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, subject_id: subjectId }),
    })
    const data = await res.json()
    setLoadingQueue(false)
    if (data.items) {
      setQueueItems(
        data.items.map(
          (i: {
            id: string
            topic_key: string
            topic_label?: string
            priority_score: number
            incidence_weight?: number
            edital_weight?: number
            gap_score?: number
            retention_penalty?: number
            reason?: string
          }) => ({
            id: i.id,
            topic_key: i.topic_key,
            topic_label: i.topic_label,
            priority_score: Number(i.priority_score),
            incidence_weight: i.incidence_weight,
            edital_weight: i.edital_weight != null ? Number(i.edital_weight) : undefined,
            gap_score: i.gap_score,
            retention_penalty: i.retention_penalty,
            reason: i.reason,
          })
        )
      )
    }
  }

  async function loadPriorities() {
    if (!userId) return
    setLoadingPriorities(true)
    const res = await fetch("/api/coach/priorities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, subject_id: subjectId }),
    })
    const data = await res.json()
    setLoadingPriorities(false)
    if (data.error) alert(data.error)
    else setPriorities(data.structured ?? null)
  }

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">{subjectName}</h2>
        <button
          type="button"
          onClick={loadPriorities}
          disabled={loadingPriorities}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
        >
          {loadingPriorities ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Ações a partir da fila
        </button>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Relatório de caderno (IA)
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Controla se questões erradas desta matéria recebem explicação no relatório. O padrão
          global está em Configurações.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["global", "Usar padrão global"],
              ["on", "Explicar erradas"],
              ["off", "Não explicar"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              disabled={savingExplain}
              onClick={() => saveExplainMode(mode)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                explainMode === mode
                  ? "border-violet-600 bg-violet-50 text-violet-900"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-violet-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-800">
            Fila estratégica desta matéria
          </h3>
          <button
            type="button"
            onClick={refreshQueue}
            disabled={loadingQueue}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingQueue ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Recalcular
          </button>
        </div>
        <p className="mb-2 text-xs text-slate-600">
          Top {Math.min(5, queueItems.length)} do ranking <strong>cruzado</strong>{" "}
          (edital × incidência × seu desempenho). Tópicos de alta incidência sem
          nenhuma questão feita não entram aqui — aparecem na página de prioridades
          em “Ainda não estudado”.
        </p>
        <Link
          href={`/coach/materias/${subjectId}/prioridades`}
          className="mb-3 inline-flex text-xs font-medium text-violet-700 hover:underline"
        >
          Ver prioridades completas (Edital × Cérebro × Cruzado) →
        </Link>
        <StrategicQueueList
          items={queueItems}
          loading={loading && !queueItems.length}
          collapseAfter={5}
          brainByTopic={brainByTopic}
        />
      </section>

      {brain && Object.keys(brain.topic_map ?? {}).length > 0 && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
                Cérebro da matéria
              </h3>
              <Link
                href={`/coach/materias/${subjectId}/cerebro`}
                className="rounded-lg bg-emerald-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-900"
              >
                Ver cérebro completo
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {brainLastReportId && (
                <Link
                  href={`/coach/relatorios/${brainLastReportId}`}
                  className="text-xs font-medium text-emerald-800 underline"
                >
                  Último relatório
                </Link>
              )}
              <button
                type="button"
                disabled={recomputingBrain || !userId}
                onClick={async () => {
                  if (!userId) return
                  setRecomputingBrain(true)
                  try {
                    const res = await fetch("/api/coach/brain/recompute", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        user_id: userId,
                        subject_id: subjectId,
                      }),
                    })
                    const data = await res.json()
                    if (!res.ok) alert(data.error ?? "Erro")
                    else {
                      setBrain(data.state ?? null)
                      setBrainSummary(data.summary_md ?? null)
                    }
                  } finally {
                    setRecomputingBrain(false)
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
              >
                {recomputingBrain ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Atualizar cérebro
              </button>
            </div>
          </div>
          {brainSummary && (
            <p className="mb-3 text-sm text-slate-700">{brainSummary}</p>
          )}
          <p className="mb-3 text-xs text-emerald-900/80">
            O cérebro aprende com cada relatório de caderno: registra{" "}
            <strong>equívocos concretos</strong> (ex.: confundiu conceito X com Y) e
            taxonomia de erro — além do status geral do tópico.
          </p>
          <p className="mb-2 text-xs text-slate-500">
            Tendência: {brain.trend}
            {brain.danger_topics?.length
              ? ` · Alerta: ${brain.danger_topics
                  .slice(0, 3)
                  .map((k) => brain.topic_map[k]?.label ?? k)
                  .join(", ")}`
              : ""}
            {brain.report_merged && " · Sincronizado com relatório recente"}
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Tópico</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Domínio</th>
                  <th className="px-3 py-2">Estab.</th>
                  <th className="px-3 py-2">Retenção</th>
                  <th className="px-3 py-2">Último equívoco / erro</th>
                </tr>
              </thead>
              <tbody>
                {visibleBrainRows.map(([topicKey, entry]) => (
                    <tr key={topicKey} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium">
                        {entry.label ?? topicKey}
                        {brain.dominio_delta?.[topicKey] != null && (
                          <span
                            className={`ml-1 text-xs ${
                              brain.dominio_delta[topicKey]! > 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            ({brain.dominio_delta[topicKey]! > 0 ? "+" : ""}
                            {Math.round(brain.dominio_delta[topicKey]! * 100)}%)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {BRAIN_STATUS_LABELS[entry.status] ?? entry.status}
                      </td>
                      <td className="px-3 py-2">{Math.round(entry.dominio * 100)}%</td>
                      <td className="px-3 py-2">
                        {Math.round(entry.estabilidade * 100)}%
                      </td>
                      <td className="px-3 py-2">
                        {Math.round(entry.retencao * 100)}%
                      </td>
                      <td className="max-w-xs px-3 py-2 text-xs">
                        {entry.last_insight ? (
                          <span
                            className="text-emerald-900"
                            title={entry.last_insight}
                          >
                            {entry.last_insight.slice(0, 120)}
                            {entry.last_insight.length > 120 ? "…" : ""}
                          </span>
                        ) : entry.predominant_error ? (
                          <span className="text-amber-800">
                            {ERROR_TAXONOMY_LABELS[entry.predominant_error]}
                          </span>
                        ) : (
                          <span className="text-slate-400">Sem detalhe ainda</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {brainTopicRows.length > BRAIN_TABLE_TOP && (
            <button
              type="button"
              onClick={() => setBrainTableExpanded((v) => !v)}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-white py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
            >
              {brainTableExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Mostrar só top {BRAIN_TABLE_TOP}
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Ver mais {brainTopicRows.length - BRAIN_TABLE_TOP} tópico
                  {brainTopicRows.length - BRAIN_TABLE_TOP === 1 ? "" : "s"} no cérebro
                </>
              )}
            </button>
          )}
        </section>
      )}

      {priorities && (
        <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-violet-700">
            Mesma ordem da fila estratégica acima
          </p>
          <p className="text-sm text-slate-800">
            {priorities.narrative_summary}
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            {(priorities.top_priorities ?? []).map((p) => (
              <li key={p.rank}>
                <span className="font-medium">{p.title}</span>
                <span className="text-slate-600"> — {p.why}</span>
                <span className="text-xs text-slate-500">
                  {" "}
                  ({p.time_minutes} min · {p.domain})
                </span>
              </li>
            ))}
          </ol>
          {(priorities.executable_actions ?? []).length > 0 && (
            <ul className="mt-4 space-y-2">
              {priorities.executable_actions!.map((action, i) => (
                <li key={`${action.type}-${i}`}>
                  {typeof action.params?.href === "string" ? (
                    <Link
                      href={action.params.href as string}
                      className="inline-flex rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-medium text-violet-900 hover:bg-violet-50"
                    >
                      {action.label}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={creatingNb}
                      onClick={() =>
                        createRemediationNotebook(action.params, action.label)
                      }
                      className="inline-flex rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-medium text-violet-900 hover:bg-violet-50 disabled:opacity-50"
                    >
                      {action.label}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Sinais de aprendizado
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
