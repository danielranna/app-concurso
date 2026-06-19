import { BookMarked, Library } from "lucide-react"

export default function MateriasIndexPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Library className="h-7 w-7 text-slate-700" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Hub de Matérias
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        Escolha uma matéria na barra lateral para ver desempenho, cadernos, erros e
        flashcards organizados em abas.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
          <BookMarked className="h-3.5 w-3.5" />
          Lista retrátil à esquerda
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
          Use a busca para filtrar
        </span>
      </div>
    </div>
  )
}
