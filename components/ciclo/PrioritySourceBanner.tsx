"use client"

import type { PrioritySource } from "@/lib/priority-source"
import { PRIORITY_SOURCE_LABELS } from "@/lib/priority-source"
import { Brain, Target } from "lucide-react"

export default function PrioritySourceBanner({
  source,
  studyMode,
}: {
  source: PrioritySource
  studyMode?: string
}) {
  const info = PRIORITY_SOURCE_LABELS[source]
  const isBrain = source === "brain"

  return (
    <div
      className={`rounded-xl border p-4 ${
        isBrain
          ? "border-teal-200 bg-teal-50/60"
          : "border-violet-200 bg-violet-50/60"
      }`}
    >
      <div className="flex items-start gap-3">
        {isBrain ? (
          <Brain className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
        ) : (
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
        )}
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Fila ativa: {info.label}
          </p>
          <p className="mt-1 text-sm text-slate-600">{info.description}</p>
          {studyMode && (
            <p className="mt-1 text-xs text-slate-500">
              Modo de estudo:{" "}
              {studyMode === "pre_edital"
                ? "Pré-edital"
                : studyMode === "pos_edital"
                  ? "Pós-edital"
                  : "Reta final"}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
