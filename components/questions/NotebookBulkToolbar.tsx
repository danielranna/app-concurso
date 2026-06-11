"use client"

import { Trash2 } from "lucide-react"

type Props = {
  selectedCount: number
  totalCount: number
  allSelected: boolean
  onSelectAll: () => void
  onClear: () => void
  onMove: () => void
  onDelete: () => void
  busy?: boolean
}

export default function NotebookBulkToolbar({
  selectedCount,
  totalCount,
  allSelected,
  onSelectAll,
  onClear,
  onMove,
  onDelete,
  busy = false,
}: Props) {
  if (selectedCount === 0) return null

  return (
    <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-slate-900 px-4 py-3 text-sm text-white shadow-md">
      <span className="font-medium">
        {selectedCount} selecionado{selectedCount !== 1 ? "s" : ""}
      </span>
      <button
        type="button"
        onClick={allSelected ? onClear : onSelectAll}
        disabled={busy || totalCount === 0}
        className="rounded border border-white/30 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-50"
      >
        {allSelected ? "Desmarcar todos" : `Selecionar todos (${totalCount})`}
      </button>
      <button
        type="button"
        onClick={onMove}
        disabled={busy}
        className="rounded bg-white px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-50"
      >
        Mover para pasta…
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-600 px-3 py-1.5 text-xs hover:bg-red-700 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" /> Excluir
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="ml-auto text-xs text-white/70 underline hover:text-white disabled:opacity-50"
      >
        Limpar seleção
      </button>
    </div>
  )
}
