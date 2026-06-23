"use client"

import Link from "next/link"
import { Play, Trash2 } from "lucide-react"
import NotebookMoveControls from "@/components/questions/NotebookMoveControls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

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
  const pct =
    notebook.question_count > 0
      ? Math.round((notebook.answered_count / notebook.question_count) * 100)
      : 0

  return (
    <Card
      className={cn(
        "mb-2 transition-all",
        nested && "ml-6",
        selected && "border-teal-300 ring-1 ring-teal-200"
      )}
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30"
              aria-label={`Selecionar ${notebook.name}`}
            />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-slate-900">{notebook.name}</p>
              {notebook.completed_at && (
                <Badge variant="success" className="text-[10px]">
                  Concluído
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500">
              {notebook.answered_count}/{notebook.question_count} respondidas
            </p>
            {notebook.question_count > 0 && (
              <Progress value={pct} className="h-1 max-w-xs" />
            )}
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
          <Button size="sm" asChild>
            <Link href={`/questoes/cadernos/${notebook.id}`}>
              <Play className="h-4 w-4" />
              Resolver
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => onDelete(notebook.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
