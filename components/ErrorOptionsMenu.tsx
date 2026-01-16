"use client"

import { useState } from "react"
import { MoreVertical, Pencil, Trash2 } from "lucide-react"

type Props = {
  onEdit: () => void
  onDelete: () => void
}

export default function ErrorOptionsMenu({
  onEdit,
  onDelete
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="rounded-md p-1 text-slate-600 hover:bg-slate-100"
        title="Opções"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <>
          {/* backdrop invisível */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />

          <div className="absolute right-0 z-20 mt-2 w-40 rounded-md border bg-white shadow-lg">
            <button
              onClick={() => {
                setOpen(false)
                onEdit()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <Pencil size={14} />
              Editar erro
            </button>

            <button
              onClick={() => {
                setOpen(false)
                onDelete()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} />
              Excluir erro
            </button>
          </div>
        </>
      )}
    </div>
  )
}
