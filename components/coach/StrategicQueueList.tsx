"use client"

import { Loader2 } from "lucide-react"

export type QueueItem = {
  id?: string
  topic_key: string
  priority_score: number
  incidence_weight?: number
  gap_score?: number
  retention_penalty?: number
  reason?: string | null
}

export default function StrategicQueueList({
  items,
  loading,
  emptyMessage = "Nenhum tópico na fila. Conclua cadernos ou recalcule a fila.",
}: {
  items: QueueItem[]
  loading?: boolean
  emptyMessage?: string
}) {
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

  return (
    <ol className="space-y-2">
      {items.map((item, idx) => (
        <li
          key={item.id ?? `${item.topic_key}-${idx}`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800">
                {idx + 1}
              </span>
              <span className="font-medium text-slate-900">{item.topic_key}</span>
              {item.reason && (
                <p className="mt-1 pl-7 text-xs text-slate-600">{item.reason}</p>
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
      ))}
    </ol>
  )
}
