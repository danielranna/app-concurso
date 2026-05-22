"use client"

import { ArrowLeft, ArrowRight, RefreshCw, Shuffle } from "lucide-react"
import type { NavMode } from "@/lib/study-navigation"

type Props = {
  onNavigate: (mode: NavMode) => void
}

export default function StudyNavBar({ onNavigate }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-slate-50 p-2">
      <button
        type="button"
        title="Anterior (←)"
        onClick={() => onNavigate("prev")}
        className="rounded-lg border border-slate-200 bg-white p-3 text-slate-700 shadow-sm hover:bg-slate-100"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        title="Próxima (→)"
        onClick={() => onNavigate("next")}
        className="rounded-lg border border-slate-200 bg-white p-3 text-slate-700 shadow-sm hover:bg-slate-100"
      >
        <ArrowRight className="h-5 w-5" />
      </button>
      <button
        type="button"
        title="Aleatória (L)"
        onClick={() => onNavigate("random")}
        className="rounded-lg border border-slate-200 bg-white p-3 text-slate-700 shadow-sm hover:bg-slate-100"
      >
        <Shuffle className="h-5 w-5" />
      </button>
      <button
        type="button"
        title="Próxima não resolvida (N)"
        onClick={() => onNavigate("unsolved")}
        className="rounded-lg border border-slate-200 bg-white p-3 text-slate-700 shadow-sm hover:bg-slate-100"
      >
        <RefreshCw className="h-5 w-5" />
      </button>
      <span className="ml-1 text-xs text-slate-400">
        ← → · L aleatória · N não resolvida
      </span>
    </div>
  )
}
