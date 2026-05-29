"use client"

import Link from "next/link"
import type { ExamPlanStructured } from "@/lib/coach-types"

const DAY_PT: Record<string, string> = {
  seg: "Seg",
  ter: "Ter",
  qua: "Qua",
  qui: "Qui",
  sex: "Sex",
  sab: "Sáb",
  dom: "Dom",
}

const RESOURCE_PT: Record<string, string> = {
  questoes: "Questões",
  flashcards: "Flashcards",
  erros: "Erros",
}

function dayLabel(day: string) {
  return DAY_PT[day.toLowerCase()] ?? day
}

function resourceLabel(r: string) {
  return RESOURCE_PT[r.toLowerCase()] ?? r
}

export default function ExamPlanReportCard({
  createdAt,
  structured,
}: {
  createdAt: string
  structured: ExamPlanStructured
}) {
  const score = structured.exam_readiness_score
  const showScore = score != null && score > 0

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-base font-medium text-slate-900">
          {structured.headline ?? "Plano da prova"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {new Date(createdAt).toLocaleString("pt-BR")}
          {showScore && (
            <span className="ml-2 font-medium text-violet-700">
              Prontidão estimada: {score}%
            </span>
          )}
        </p>
      </div>

      {structured.subject_priority_rank &&
        structured.subject_priority_rank.length > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Prioridade das matérias
            </h4>
            <ol className="space-y-2">
              {structured.subject_priority_rank.map((row, i) => (
                <li
                  key={`${row.priority}-${row.subject_name}-${i}`}
                  className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
                >
                  <span className="font-medium text-slate-900">
                    {row.priority}. {row.subject_name}
                  </span>
                  {row.why && (
                    <p className="mt-0.5 text-xs text-slate-600">{row.why}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

      {structured.weekly_plan && structured.weekly_plan.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Semana sugerida
          </h4>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dia</th>
                  <th className="px-3 py-2">Foco</th>
                  <th className="px-3 py-2">Tempo</th>
                  <th className="px-3 py-2">Recurso</th>
                </tr>
              </thead>
              <tbody>
                {structured.weekly_plan.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {dayLabel(row.day)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.focus}</td>
                    <td className="px-3 py-2 text-slate-600">{row.minutes} min</td>
                    <td className="px-3 py-2 text-violet-800">
                      {resourceLabel(row.resource)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {structured.topic_matrix && structured.topic_matrix.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Matriz de tópicos (amostra)
          </h4>
          <ul className="max-h-40 space-y-1 overflow-auto text-xs text-slate-600">
            {structured.topic_matrix.slice(0, 8).map((row, i) => (
              <li key={i}>
                <strong>{row.subject}</strong>
                {row.topic ? ` · ${row.topic}` : ""}
                {row.action ? ` — ${row.action}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {structured.executable_actions &&
        structured.executable_actions.length > 0 && (
          <section className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
            <h4 className="text-xs font-semibold text-amber-900">
              Ações sugeridas
            </h4>
            <p className="mt-1 text-xs text-amber-800">
              Confira em{" "}
              <Link href="/coach/inbox" className="font-medium underline">
                Pendências
              </Link>
              .
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-900">
              {structured.executable_actions.map((a, i) => (
                <li key={i}>• {a.label}</li>
              ))}
            </ul>
          </section>
        )}

      {structured.risks_if_ignored &&
        structured.risks_if_ignored.length > 0 && (
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Riscos se ignorar
            </h4>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-slate-600">
              {structured.risks_if_ignored.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        )}
    </div>
  )
}
