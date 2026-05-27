"use client"

import {
  SIGNAL_DESCRIPTIONS,
  SIGNAL_LABELS,
} from "@/lib/coach-labels"
import type { LearningSignal } from "@/lib/coach-types"

type Props = {
  signals: LearningSignal[]
  dangerTopicKeys: string[]
}

export default function BrainSignalsList({ signals, dangerTopicKeys }: Props) {
  if (!signals.length) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Sinais de aprendizado
        </h2>
        <p className="mt-3 text-sm text-slate-500">
          Nenhum padrão detectado ainda — resolva mais questões nesta matéria.
        </p>
      </section>
    )
  }

  const dangerSet = new Set(dangerTopicKeys)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
        Sinais de aprendizado ({signals.length})
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Padrões automáticos que podem reforçar alertas no mapa de tópicos.
      </p>
      <ul className="mt-4 space-y-3">
        {signals.map((s, i) => {
          const topic = s.metadata?.tec_topic as string | undefined
          const topicKey = topic ? topic.toLowerCase().trim() : ""
          const affectsDanger =
            s.entity_type === "tec_topic" && dangerSet.has(s.entity_id)
          return (
            <li
              key={`${s.signal_type}-${s.entity_id}-${i}`}
              className={`rounded-lg border p-3 ${
                affectsDanger
                  ? "border-amber-300 bg-amber-50/50"
                  : "border-slate-100 bg-slate-50/50"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-900">
                  {SIGNAL_LABELS[s.signal_type]}
                </span>
                <span className="text-xs tabular-nums text-slate-500">
                  score {s.score}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {SIGNAL_DESCRIPTIONS[s.signal_type]}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {s.entity_type === "question"
                  ? `Questão · ${(s.metadata?.tec_id as number) ?? s.entity_id.slice(0, 8)}`
                  : `Tópico · ${s.entity_id}`}
                {topic && ` · ${topic}`}
                {(s.metadata?.wrong_count as number) != null && (
                  <> · {String(s.metadata?.wrong_count)} erros</>
                )}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
