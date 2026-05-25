"use client"

import Link from "next/link"
import ReportSourceBadge from "@/components/coach/ReportSourceBadge"
import type { NotebookReportStructured } from "@/lib/coach-types"
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

export default function NotebookReportDetail({
  report,
  backHref,
}: {
  report: Report
  backHref: string
}) {
  const nb = unwrapNotebook(report.notebooks)
  const s = report.structured

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
      </header>

      {report.summary_md && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Resumo
          </h2>
          <div className="prose prose-slate max-w-none text-sm text-slate-700 whitespace-pre-wrap">
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
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-700">
            {s.actions_next_7_days.map((a, i) => (
              <li key={i}>
                {a.action}
                {a.minutes_estimate
                  ? ` (~${a.minutes_estimate} min)`
                  : ""}
              </li>
            ))}
          </ol>
        </section>
      )}

      {s?.per_question_errors && s.per_question_errors.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Erros por questão (classificados)
          </h2>
          <ul className="space-y-4">
            {[...s.per_question_errors]
              .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
              .map((eq, i) => {
                const askTopic = eq.tec_topic ?? "este tópico"
                const materiaisHref = report.subject_id
                  ? `/coach/materias/${report.subject_id}/materiais?ask=${encodeURIComponent(
                      `Explique com mais detalhe: ${askTopic}`
                    )}`
                  : null
                return (
                  <li
                    key={eq.question_id ?? i}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                        {ERROR_TAXONOMY_LABELS[eq.error_taxonomy] ??
                          eq.error_taxonomy}
                      </span>
                      {eq.tec_topic && (
                        <span className="text-slate-600">{eq.tec_topic}</span>
                      )}
                      {eq.topic_group_size != null && eq.topic_group_size > 1 && (
                        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                          {eq.topic_group_size} questões no tópico
                        </span>
                      )}
                      {eq.priority_score != null && (
                        <span className="text-xs text-slate-400">
                          prioridade {Math.round(eq.priority_score)}
                        </span>
                      )}
                    </div>
                    {eq.specific_mistake && (
                      <p className="mt-2 text-slate-800">{eq.specific_mistake}</p>
                    )}
                    {eq.explanation && (
                      <div className="mt-2 rounded border border-slate-200 bg-white p-2">
                        <p className="text-xs font-medium text-slate-500">
                          {eq.explanation_source === "material"
                            ? "Professor (material)"
                            : "Explicação IA"}
                        </p>
                        <p className="mt-1 text-slate-700">{eq.explanation}</p>
                        {eq.explanation_citations &&
                          eq.explanation_citations.length > 0 && (
                            <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                              {eq.explanation_citations.map((c, ci) => (
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
              })}
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
                    <Link href={href} className="font-medium underline hover:text-amber-950">
                      {a.label}
                    </Link>
                  ) : (
                    <>• {a.label}</>
                  )}
                  {a.estimated_minutes != null && (
                    <span className="text-amber-700"> (~{a.estimated_minutes} min)</span>
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
