"use client"

import Link from "next/link"
import type { PriorityBreakdownRow } from "@/lib/ai/priority-breakdown"
import { BRAIN_STATUS_LABELS } from "@/lib/coach-labels"
import { brainStatusBadgeClass } from "./brain-status-styles"

type Props = {
  subjectId: string
  items: PriorityBreakdownRow[]
}

export default function BrainPriorityBridge({ subjectId, items }: Props) {
  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/30 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-800">
        Como isso vira prioridade
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        O Coach combina <strong>gap de domínio</strong>, estabilidade, erros e peso
        do status do tópico. O ranking cruzado (edital × incidência × cérebro) alimenta
        a fila estratégica.
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Resolva questões mapeadas para ver prioridades por desempenho.
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {items.map((row, i) => (
            <li
              key={row.topic_key}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm"
            >
              <span className="font-bold tabular-nums text-violet-700">
                {row.rank ?? i + 1}
              </span>
              <span className="min-w-0 flex-1 font-medium text-slate-900">
                {row.topic_label}
              </span>
              {row.brain_status && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${brainStatusBadgeClass(row.brain_status)}`}
                >
                  {BRAIN_STATUS_LABELS[row.brain_status] ?? row.brain_status}
                </span>
              )}
              <span className="text-xs text-slate-500 tabular-nums">
                domínio {Math.round((row.dominio ?? 0) * 100)}%
                {row.brain_urgency_score != null && (
                  <> · urgência {row.brain_urgency_score.toFixed(2)}</>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      <Link
        href={`/coach/materias/${subjectId}/prioridades`}
        className="mt-4 inline-flex text-sm font-medium text-violet-700 hover:underline"
      >
        Ver prioridades completas (Edital × Cérebro × Cruzado) →
      </Link>
    </section>
  )
}
