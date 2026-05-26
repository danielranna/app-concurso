"use client"

import Link from "next/link"
import ReportSourceBadge from "@/components/coach/ReportSourceBadge"
import type {
  BehavioralAuditQuestionItem,
  NotebookReportStructured,
  PerQuestionError,
} from "@/lib/coach-types"
import { ERROR_TAXONOMY_LABELS } from "@/lib/coach-labels"
import { ArrowLeft } from "lucide-react"

type Report = {
  id: string
  notebook_id: string
  subject_id: string | null
  summary_md: string | null
  structured: NotebookReportStructured
  model_used: string | null
  created_at: string
  notebooks:
    | { name: string; question_count: number; completed_at: string | null }
    | { name: string; question_count: number; completed_at: string | null }[]
    | null
}

function unwrapNotebook(
  nb: Report["notebooks"]
): { name: string; question_count: number } | null {
  if (!nb) return null
  return Array.isArray(nb) ? nb[0] ?? null : nb
}

function zoneLabel(zone?: string) {
  if (zone === "yellow") return "Zona amarela"
  if (zone === "green") return "Zona verde"
  return "Zona vermelha"
}

function zoneBadgeClass(zone?: string) {
  if (zone === "yellow") return "bg-amber-100 text-amber-900"
  if (zone === "green") return "bg-green-100 text-green-800"
  return "bg-red-100 text-red-800"
}

function QuestionAuditCard({
  eq,
  report,
  materiaisAsk,
}: {
  eq: PerQuestionError | BehavioralAuditQuestionItem
  report: Report
  materiaisAsk: string
}) {
  const isPerQuestion = "error_taxonomy" in eq && eq.error_taxonomy != null
  const perQ = isPerQuestion ? (eq as PerQuestionError) : null
  const auditItem = !isPerQuestion ? (eq as BehavioralAuditQuestionItem) : null

  const header =
    perQ?.header_label ??
    auditItem?.header_label ??
    (perQ?.question_index != null ? `Q${perQ.question_index}` : "")
  const marked = perQ?.marked_answer ?? auditItem?.marked
  const key = perQ?.correct_answer ?? auditItem?.answer_key
  const note = perQ?.user_note ?? auditItem?.user_note
  const feedback = perQ?.feedback_detailed ?? auditItem?.feedback
  const topic = perQ?.tec_topic
  const taxonomy = perQ?.error_taxonomy
  const zone = perQ?.zone
  const statement =
    perQ?.statement_excerpt ?? auditItem?.statement_excerpt

  const materiaisHref = report.subject_id
    ? `/coach/materias/${report.subject_id}/materiais?ask=${encodeURIComponent(materiaisAsk)}`
    : null

  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {zone && (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${zoneBadgeClass(zone)}`}
          >
            {zoneLabel(zone)}
          </span>
        )}
        {taxonomy && (
          <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
            {ERROR_TAXONOMY_LABELS[taxonomy] ?? taxonomy}
          </span>
        )}
        {header && (
          <span className="font-medium text-slate-800">{header}</span>
        )}
        {topic && !header?.includes(topic) && (
          <span className="text-slate-600">{topic}</span>
        )}
        {perQ?.priority_score != null && (
          <span className="text-xs text-slate-400">
            prioridade {Math.round(perQ.priority_score)}
          </span>
        )}
      </div>

      {statement && (
        <p className="mt-2 text-xs text-slate-600 line-clamp-3">{statement}</p>
      )}

      {marked != null && key != null && (
        <p className="mt-2 font-medium text-slate-800">
          Marcada: [{marked}] | Gabarito: [{key}]
        </p>
      )}

      {note && (
        <div className="mt-2 rounded border border-blue-100 bg-blue-50 p-2">
          <p className="text-xs font-medium text-blue-800">Sua nota</p>
          <p className="mt-1 text-sm text-blue-900">{note}</p>
        </div>
      )}

      {(perQ?.misconception ?? perQ?.specific_mistake) && !feedback && (
        <p className="mt-2 text-slate-800">
          {perQ?.misconception ?? perQ?.specific_mistake}
        </p>
      )}

      {feedback && (
        <div className="mt-2 rounded border border-slate-200 bg-white p-2">
          <p className="text-xs font-medium text-slate-500">Auditoria (Fase 2)</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-700">{feedback}</p>
        </div>
      )}

      {perQ?.explanation && (
        <div className="mt-2 rounded border border-slate-200 bg-white p-2">
          <p className="text-xs font-medium text-slate-500">
            {perQ.explanation_source === "material"
              ? "Professor (material)"
              : "Material de apoio"}
          </p>
          <p className="mt-1 text-slate-700">{perQ.explanation}</p>
          {perQ.explanation_citations && perQ.explanation_citations.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
              {perQ.explanation_citations.map((c, ci) => (
                <li key={ci} className="text-xs text-slate-600">
                  <span className="font-medium text-slate-800">
                    {c.document_title}
                    {c.page != null ? ` (p. ${c.page})` : ""}
                  </span>
                  : {c.excerpt}
                </li>
              ))}
            </ul>
          )}
          {materiaisHref && (
            <Link
              href={materiaisHref}
              className="mt-2 inline-block text-xs font-medium text-violet-700 underline"
            >
              Aprofundar no Professor
            </Link>
          )}
        </div>
      )}
    </li>
  )
}

export default function NotebookReportDetail({
  report,
  backHref,
  onRegenerateAudit,
  regeneratingAudit,
}: {
  report: Report
  backHref: string
  onRegenerateAudit?: () => void
  regeneratingAudit?: boolean
}) {
  const nb = unwrapNotebook(report.notebooks)
  const s = report.structured
  const audit = s?.behavioral_audit
  const perf = audit?.performance_summary

  const redErrors =
    s?.per_question_errors?.filter((e) => e.zone !== "yellow") ?? []
  const yellowFromErrors =
    s?.per_question_errors?.filter((e) => e.zone === "yellow") ?? []
  const yellowAudit = audit?.yellow_zone ?? []
  const yellowIds = new Set(yellowFromErrors.map((e) => e.question_id))
  const yellowOnlyAudit = yellowAudit.filter(
    (y) => !yellowIds.has(y.question_id)
  )

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <header className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">
            {nb?.name ?? "Caderno"}
          </h1>
          <ReportSourceBadge modelUsed={report.model_used} />
        </div>
        <p className="mt-2 text-lg text-slate-800">{s?.headline}</p>
        <p className="mt-2 text-xs text-slate-500">
          {new Date(report.created_at).toLocaleString("pt-BR")}
          {nb?.question_count != null && ` · ${nb.question_count} questões`}
          {s?.confidence_in_analysis && (
            <> · Confiança: {s.confidence_in_analysis}</>
          )}
        </p>
        {onRegenerateAudit && (
          <button
            type="button"
            onClick={onRegenerateAudit}
            disabled={regeneratingAudit}
            className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-60"
          >
            {regeneratingAudit
              ? "Regenerando auditoria…"
              : "Regenerar auditoria detalhada"}
          </button>
        )}
      </header>

      {perf && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Desempenho do caderno
          </h2>
          <div className="flex flex-wrap items-baseline gap-4">
            <p className="text-2xl font-bold text-slate-900">
              {perf.correct}/{perf.total}{" "}
              <span className="text-lg font-semibold text-slate-600">
                ({perf.pct}%)
              </span>
            </p>
            {perf.avg_duration_ms != null && perf.avg_duration_ms > 0 && (
              <p className="text-sm text-slate-600">
                Tempo médio: {Math.round(perf.avg_duration_ms / 1000)}s
              </p>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Grupo 1 (vermelha): {perf.groups.red} · Grupo 2 (amarela):{" "}
            {perf.groups.yellow} · Grupo 3 (verde): {perf.groups.green}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-violet-600"
              style={{ width: `${perf.pct}%` }}
            />
          </div>
        </section>
      )}

      {report.summary_md && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Resumo
          </h2>
          <div className="prose prose-slate max-w-none whitespace-pre-wrap text-sm text-slate-700">
            {report.summary_md}
          </div>
        </section>
      )}

      {s?.weaknesses?.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pontos fracos
          </h2>
          <ul className="space-y-2 text-sm text-slate-700">
            {s.weaknesses.map((w, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{w.topic}</strong> ({w.severity}) — {w.evidence}
                </span>
                {report.subject_id && (
                  <Link
                    href={`/coach/materias/${report.subject_id}/materiais?ask=${encodeURIComponent(
                      `Como estudar ${w.topic}? Quais pontos revisar nos meus materiais?`
                    )}`}
                    className="shrink-0 text-xs font-medium text-violet-700 underline"
                  >
                    Perguntar ao Professor
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {s?.strengths?.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pontos fortes
          </h2>
          <ul className="space-y-2 text-sm text-slate-700">
            {s.strengths.map((w, i) => (
              <li key={i}>
                <strong>{w.topic}</strong> — {w.evidence}
              </li>
            ))}
          </ul>
        </section>
      )}

      {s?.actions_next_7_days?.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Plano (7 dias)
          </h2>
          <ol className="list-inside list-decimal space-y-1 text-sm text-slate-700">
            {s.actions_next_7_days.map((a, i) => (
              <li key={i}>
                {a.action}
                {a.minutes_estimate ? ` (~${a.minutes_estimate} min)` : ""}
              </li>
            ))}
          </ol>
        </section>
      )}

      {(redErrors.length > 0 || (audit?.red_zone?.length ?? 0) > 0) && (
        <section className="rounded-xl border border-red-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-700">
            1º grupo — Zona vermelha (erros e lógicas incorretas)
          </h2>
          <ul className="space-y-4">
            {[...redErrors]
              .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
              .map((eq, i) => (
                <QuestionAuditCard
                  key={eq.question_id ?? i}
                  eq={eq}
                  report={report}
                  materiaisAsk={`Explique com mais detalhe: ${eq.tec_topic ?? "este tópico"}`}
                />
              ))}
          </ul>
        </section>
      )}

      {(yellowFromErrors.length > 0 || yellowOnlyAudit.length > 0) && (
        <section className="rounded-xl border border-amber-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-800">
            2º grupo — Zona amarela (acertos instáveis)
          </h2>
          <ul className="space-y-4">
            {yellowFromErrors.map((eq, i) => (
              <QuestionAuditCard
                key={eq.question_id ?? `y-${i}`}
                eq={eq}
                report={report}
                materiaisAsk={`Reforçar conceito: ${eq.tec_topic ?? "este tópico"}`}
              />
            ))}
            {yellowOnlyAudit.map((eq, i) => (
              <QuestionAuditCard
                key={eq.question_id ?? `ya-${i}`}
                eq={eq}
                report={report}
                materiaisAsk={`Reforçar conceito da questão ${eq.question_index}`}
              />
            ))}
          </ul>
        </section>
      )}

      {audit?.green_zone && (
        <section className="rounded-xl border border-green-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-green-800">
            3º grupo — Zona verde (alta performance)
          </h2>
          {audit.green_zone.mastered_indexes.length > 0 && (
            <p className="mb-2 text-sm text-slate-700">
              <strong>Questões dominadas:</strong>{" "}
              {audit.green_zone.mastered_indexes.map((n) => `Q${n}`).join(", ")}.
            </p>
          )}
          {audit.green_zone.theory_balance && (
            <p className="whitespace-pre-wrap text-sm text-slate-700">
              <strong>Balanço de teoria:</strong> {audit.green_zone.theory_balance}
            </p>
          )}
        </section>
      )}

      {redErrors.length === 0 &&
        yellowFromErrors.length === 0 &&
        yellowOnlyAudit.length === 0 &&
        s?.per_question_errors &&
        s.per_question_errors.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Erros por questão (classificados)
            </h2>
            <ul className="space-y-4">
              {[...s.per_question_errors]
                .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
                .map((eq, i) => (
                  <QuestionAuditCard
                    key={eq.question_id ?? i}
                    eq={eq}
                    report={report}
                    materiaisAsk={`Explique: ${eq.tec_topic ?? "este tópico"}`}
                  />
                ))}
            </ul>
          </section>
        )}

      {s?.executable_actions?.length > 0 && (
        <section className="rounded-xl border border-amber-100 bg-amber-50 p-5">
          <h2 className="mb-2 text-sm font-semibold text-amber-900">
            Ações sugeridas
          </h2>
          <p className="mb-3 text-sm text-amber-800">
            Aprove em{" "}
            <Link href="/coach/inbox" className="font-medium underline">
              Ações pendentes
            </Link>{" "}
            ou use o botão na matéria (Insights).
          </p>
          <ul className="space-y-2 text-sm text-amber-900">
            {s.executable_actions.map((a, i) => {
              const href = a.params?.href as string | undefined
              return (
                <li key={i}>
                  {href ? (
                    <Link
                      href={href}
                      className="font-medium underline hover:text-amber-950"
                    >
                      {a.label}
                    </Link>
                  ) : (
                    <>• {a.label}</>
                  )}
                  {a.estimated_minutes != null && (
                    <span className="text-amber-700">
                      {" "}
                      (~{a.estimated_minutes} min)
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <Link
        href={`/questoes/cadernos/${report.notebook_id}`}
        className="inline-block text-sm font-medium text-violet-700 hover:underline"
      >
        Abrir caderno original →
      </Link>
    </div>
  )
}
