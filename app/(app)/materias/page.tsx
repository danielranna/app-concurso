"use client"

import { BookMarked, Library } from "lucide-react"
import MateriasHubManager from "@/components/materias/MateriasHubManager"

export default function MateriasIndexPage() {
  return (
    <div className="px-4 py-8 sm:px-0">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Library className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Hub de Matérias
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
            Crie, renomeie e apague matérias e temas aqui. Elas valem para questões, ciclo,
            flashcards e cadernos. O mapeamento TEC continua em Questões → Mapeamento.
          </p>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
          <BookMarked className="h-3.5 w-3.5" />
          Lista retrátil à esquerda
        </span>
      </div>
      <MateriasHubManager />
    </div>
  )
}
