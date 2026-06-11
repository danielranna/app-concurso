"use client"

import { Loader2, Pause, Play } from "lucide-react"

type CycleToggleProps = {
  cycleEnabled: boolean
  hasCycle: boolean
  loading?: boolean
  onPause: () => void
  onResume: () => void
}

export default function CycleToggle({
  cycleEnabled,
  hasCycle,
  loading,
  onPause,
  onResume,
}: CycleToggleProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {cycleEnabled ? "Ciclo ativo" : "Seguindo consultoria"}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {cycleEnabled
              ? "O executor usa seu planejamento de ciclo e a fila cérebro (pré-edital)."
              : "Estude pelos PDFs da consultoria em Questões → Semana. O ciclo fica pausado."}
          </p>
        </div>
        {hasCycle && (
          <button
            type="button"
            disabled={loading}
            onClick={cycleEnabled ? onPause : onResume}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              cycleEnabled
                ? "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                : "bg-teal-600 text-white hover:bg-teal-700"
            }`}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : cycleEnabled ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {cycleEnabled ? "Pausar ciclo" : "Retomar ciclo"}
          </button>
        )}
      </div>
    </div>
  )
}
