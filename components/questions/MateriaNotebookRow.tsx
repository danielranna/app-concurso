"use client"

import Link from "next/link"
import { Play, Trash2 } from "lucide-react"
import NotebookMoveControls from "@/components/questions/NotebookMoveControls"

export type MateriaNotebook = {
  id: string
  name: string
  question_count: number
  answered_count: number
  completed_at: string | null
  folder_id: string | null
}

type FolderOption = { id: string; name: string }

type Props = {
  notebook: MateriaNotebook
  userId: string
  subjectId: string
  folders: FolderOption[]
  onMoved: () => void
  onDelete: (id: string) => void
  nested?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

export default function MateriaNotebookRow({
  notebook,
  userId,
  subjectId,
  folders,
  onMoved,
  onDelete,
  nested = false,
  selected = false,
  onToggleSelect,
}: Props) {
  return (
    <div
      className={`mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-4 py-3 ${
        nested ? "ml-6 border-slate-200" : ""
      } ${selected ? "border-slate-400 ring-1 ring-slate-300" : ""}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
            aria-label={`Selecionar ${notebook.name}`}
          />
        )}
        <div className="min-w-0">
        <p className="font-medium text-blue-700">{notebook.name}</p>
        <p className="text-sm text-slate-500">
          {notebook.answered_count}/{notebook.question_count} respondidas
          {notebook.completed_at && " · Concluído"}
        </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NotebookMoveControls
          userId={userId}
          notebookId={notebook.id}
          notebookName={notebook.name}
          subjectId={subjectId}
          currentFolderId={notebook.folder_id}
          folders={folders}
          showSameSubjectRoot={Boolean(notebook.folder_id)}
          onMoved={onMoved}
        />
        <Link
          href={`/questoes/cadernos/${notebook.id}`}
          className="inline-flex items-center gap-1 rounded bg-green-600 px-3 py-1.5 text-sm text-white"
        >
          <Play className="h-4 w-4" /> Resolver
        </Link>
        <button
          type="button"
          onClick={() => onDelete(notebook.id)}
          className="text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
