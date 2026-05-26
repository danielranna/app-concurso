"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { BRAIN_STATUS_LABELS, ERROR_TAXONOMY_LABELS } from "@/lib/coach-labels"
import type { ErrorTaxonomy } from "@/lib/coach-types"

export type QueueItem = {
  id?: string
  topic_key: string
  topic_label?: string
  priority_score: number
  incidence_weight?: number
  edital_weight?: number
  gap_score?: number
  retention_penalty?: number
  reason?: string | null
}

export type BrainTopicHint = {
  last_insight?: string
  predominant_error?: ErrorTaxonomy
  status?: string
}

export default function StrategicQueueList({
  items,
  loading,
  emptyMessage = "Nenhum tópico na fila. Conclua cadernos ou recalcule a fila.",
  collapseAfter = 5,
  brainByTopic,
}: {
  items: QueueItem[]
  loading?: boolean
  emptyMessage?: string
  /** Mostra só os N primeiros até o usuário expandir; 0 = sem colapso */
  collapseAfter?: number
  brainByTopic?: Record<string, BrainTopicHint>
}) {
  const [expanded, setExpanded] = useState(false)
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando fila…
      </div>
    )
  }

  if (!items.length) {
    return <p className="py-4 text-sm text-slate-500">{emptyMessage}</p>
  }

  const maxScore = Math.max(...items.map((i) => i.priority_score), 0.01)
  const shouldCollapse =
    collapseAfter > 0 && items.length > collapseAfter && !expanded
  const visibleItems = shouldCollapse ? items.slice(0, collapseAfter) : items
  const hiddenCount = items.length - collapseAfter

  return (
  <>
    <ol className="space-y-2">
      {visibleItems.map((item, idx) => {
        const brain = brainByTopic?.[item.topic_key]
        return (
        <li
          key={item.id ?? `${item.topic_key}-${idx}`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">
                {idx + 1}
              </span>
              <span className="font-medium text-slate-900">
                {item.topic_label ?? item.topic_key}
              </span>
              {item.reason && (
                <p className="mt-1 pl-7 text-xs text-slate-600">{item.reason}</p>
              )}
              {brain?.last_insight && (
                <p className="mt-1.5 pl-7 text-xs text-emerald-800">
                  <span className="font-medium">Equívoco detectado: </span>
                  {brain.last_insight}
                </p>
              )}
              {!brain?.last_insight && brain?.predominant_error && (
                <p className="mt-1 pl-7 text-xs text-emerald-700">
                  Tipo de erro:{" "}
                  {ERROR_TAXONOMY_LABELS[brain.predominant_error] ??
                    brain.predominant_error}
                </p>
              )}
              {brain?.status && (
                <p className="mt-0.5 pl-7 text-[10px] text-slate-500">
                  Cérebro: {BRAIN_STATUS_LABELS[brain.status] ?? brain.status}
                </p>
              )}
            </div>
            <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {item.priority_score.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{
                width: `${Math.min(100, (item.priority_score / maxScore) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2 pl-7 text-[10px] text-slate-500">
            {item.edital_weight != null && item.edital_weight > 0 && (
              <span>Edital ×{item.edital_weight.toFixed(1)}</span>
            )}
            {item.incidence_weight != null && (
              <span>Incid. ×{item.incidence_weight.toFixed(1)}</span>
            )}
            {item.gap_score != null && (
              <span>Gap {item.gap_score.toFixed(2)}</span>
            )}
            {item.retention_penalty != null && (
              <span>Ret. ×{item.retention_penalty.toFixed(2)}</span>
            )}
          </div>
        </li>
        )
      })}
    </ol>
    {collapseAfter > 0 && items.length > collapseAfter && (
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        {expanded ? (
          <>
            <ChevronUp className="h-4 w-4" />
            Mostrar só top {collapseAfter}
          </>
        ) : (
          <>
            <ChevronDown className="h-4 w-4" />
            Ver mais {hiddenCount} tópico{hiddenCount === 1 ? "" : "s"} na fila
          </>
        )}
      </button>
    )}
  </>
  )
}
