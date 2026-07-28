"use client"

import { cn } from "@/lib/utils"
import type { WeakTopicRow } from "@/lib/question-statistics-analysis"

type TopicFilter = { subject_id: string | null; topic: string } | null

type Props = {
  topics: WeakTopicRow[]
  selected: TopicFilter
  onSelect: (filter: TopicFilter) => void
}

const LEVEL_STYLE: Record<
  WeakTopicRow["level"],
  { label: string; className: string }
> = {
  critico: {
    label: "Crítico",
    className: "bg-red-100 text-red-800",
  },
  fragil: {
    label: "Frágil",
    className: "bg-amber-100 text-amber-800",
  },
  ok: {
    label: "OK",
    className: "bg-slate-100 text-slate-600",
  },
}

export default function WeakTopicsRanking({
  topics,
  selected,
  onSelect,
}: Props) {
  if (!topics.length) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">
        Precisa de pelo menos 5 tentativas por assunto para ranquear pontos
        fracos.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Clique para filtrar a distribuição de erros.
        </p>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs font-medium text-teal-700 hover:underline"
          >
            Limpar filtro
          </button>
        )}
      </div>
      <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
        {topics.map((t) => {
          const isActive =
            selected &&
            selected.topic === t.topic &&
            selected.subject_id === t.subject_id
          const badge = LEVEL_STYLE[t.level]
          return (
            <li key={`${t.subject_id ?? "x"}||${t.topic}`}>
              <button
                type="button"
                onClick={() =>
                  onSelect(
                    isActive
                      ? null
                      : { subject_id: t.subject_id, topic: t.topic }
                  )
                }
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                  isActive
                    ? "border-teal-300 bg-teal-50/80 ring-1 ring-teal-200"
                    : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/80"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {t.topic}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {t.subject_name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={cn(
                      "inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                      badge.className
                    )}
                  >
                    {badge.label}
                  </span>
                  <p className="mt-1 text-xs tabular-nums text-slate-600">
                    {t.correct_pct}% · {t.wrong}/{t.total} erros
                  </p>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
