"use client"

import { Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

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
    <Card className="sticky top-2 z-10 mb-3 border-teal-200/80 bg-teal-50/60 shadow-md shadow-teal-100/50">
      <CardContent className="flex flex-wrap items-center gap-2 p-3">
        <Badge variant="default">{selectedCount} selecionado{selectedCount !== 1 ? "s" : ""}</Badge>
        <Button
          variant="secondary"
          size="sm"
          onClick={allSelected ? onClear : onSelectAll}
          disabled={busy || totalCount === 0}
        >
          {allSelected ? "Desmarcar todos" : `Selecionar todos (${totalCount})`}
        </Button>
        <Button variant="secondary" size="sm" onClick={onMove} disabled={busy}>
          Mover para pasta…
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-red-200 text-red-700 hover:bg-red-50"
          onClick={onDelete}
          disabled={busy}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={busy}
          className="ml-auto text-slate-500"
        >
          Limpar seleção
        </Button>
      </CardContent>
    </Card>
  )
}
