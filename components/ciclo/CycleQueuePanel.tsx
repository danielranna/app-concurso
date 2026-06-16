"use client"

import { useState } from "react"
import { Check, ChevronDown, ChevronUp, Loader2, SkipForward } from "lucide-react"
import type { PaceAnalytics, QueueState } from "@/lib/study-cycle-queue"
import type { StudyCycle } from "@/lib/study-cycle-types"

type Props = {
  userId: string
  cycle: StudyCycle
  queue: QueueState
  loading?: boolean
  onQueueChange: (data: {
    queue: QueueState
    cycle: StudyCycle
    pace?: PaceAnalytics
  }) => void
}

export default function CycleQueuePanel({
  userId,
  cycle,
  queue,
  loading,
  onQueueChange,
}: Props) {
  const [acting, setActing] = useState(false)
  const [showPending, setShowPending] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const weightMap = new Map(
    cycle.subjects.map((s) => [s.subject_id, s.weight ?? s.times_in_cycle ?? 1])
  )

  async function runAction(action: "complete" | "skip") {
    if (!queue.current?.id) return
    setActing(true)
    try {
      const res = await fetch("/api/ciclo/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action,
          block_id: queue.current.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? "Erro")
        return
      }
      if (data.queue && data.cycle) {
        onQueueChange({
          queue: data.queue,
          cycle: data.cycle,
          pace: data.pace ?? undefined,
        })
      }
    } finally {
      setActing(false)
    }
  }

  const nextPending = queue.pending.slice(1, 6)
  const recentCompleted = queue.completed.slice(0, 10)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Fila de estudo
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Siga a ordem do calendário. Pode estudar mais ou menos blocos por dia.
          </p>
        </div>
        <p className="text-xs text-slate-600">
          <span className="font-medium text-teal-700">{queue.stats.completed}</span> concluídas
          {" · "}
          <span className="font-medium">{queue.stats.pending}</span> restantes
          {" · "}
          {queue.stats.total} total
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : queue.current ? (
        <div className="mt-4 rounded-lg border-2 border-teal-200 bg-teal-50/40 p-4">
          <p className="text-xs font-medium uppercase text-teal-800">Agora</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {queue.current.subject_name ?? "Matéria"}
          </p>
          <p className="text-sm text-slate-700">{queue.current.label}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded bg-white/80 px-2 py-0.5 text-xs">
              ×{weightMap.get(queue.current.subject_id) ?? 1}
            </span>
            {queue.current.params.block_pass != null && (
              <span className="rounded bg-white/80 px-2 py-0.5 text-xs">
                {queue.current.params.block_pass}ª pass
              </span>
            )}
            {queue.current.params.mini_cycle_index != null && (
              <span className="rounded bg-white/80 px-2 py-0.5 text-xs">
                mc{queue.current.params.mini_cycle_index + 1}
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={acting}
              onClick={() => runAction("complete")}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {acting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Concluir
            </button>
            <button
              type="button"
              disabled={acting || queue.pending.length < 2}
              onClick={() => runAction("skip")}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <SkipForward className="h-4 w-4" />
              Trocar com o próximo
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-4 text-center text-sm text-emerald-800">
          Todas as sessões foram concluídas.
        </p>
      )}

      {nextPending.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowPending(!showPending)}
            className="flex w-full items-center justify-between text-sm font-medium text-slate-700"
          >
            Próximas ({queue.pending.length - (queue.current ? 1 : 0)})
            {showPending ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showPending && (
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {nextPending.map((item) => (
                <li
                  key={item.id}
                  className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5"
                >
                  <span className="font-medium">{item.subject_name}</span>
                  {" — "}
                  {item.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {recentCompleted.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex w-full items-center justify-between text-sm font-medium text-slate-700"
          >
            Concluídas ({queue.stats.completed})
            {showCompleted ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showCompleted && (
            <ul className="mt-2 space-y-1 text-sm text-slate-500">
              {recentCompleted.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded border border-slate-100 px-2 py-1.5 line-through opacity-80"
                >
                  <Check className="h-3 w-3 shrink-0 text-emerald-600" />
                  <span>
                    {item.subject_name} — {item.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
