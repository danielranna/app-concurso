import Link from "next/link"
import { ChevronDown, ChevronUp, GripVertical, Pencil, Play, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatTutorialDate, type Tutorial } from "@/lib/tutorials"

type Props = {
  tutorial: Tutorial
  canManage?: boolean
  canReorder?: boolean
  isFirst?: boolean
  isLast?: boolean
  isDragging?: boolean
  isDropTarget?: boolean
  onDelete?: (tutorial: Tutorial) => void
  onMoveUp?: (tutorial: Tutorial) => void
  onMoveDown?: (tutorial: Tutorial) => void
  onDragStart?: (tutorial: Tutorial) => void
  onDragOver?: (tutorial: Tutorial, e: React.DragEvent) => void
  onDrop?: (tutorial: Tutorial) => void
  onDragEnd?: () => void
}

export default function TutorialCard({
  tutorial,
  canManage,
  canReorder,
  isFirst,
  isLast,
  isDragging,
  isDropTarget,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  return (
    <Card
      className={cn(
        "flex h-full flex-col overflow-hidden transition",
        isDragging && "opacity-50",
        isDropTarget && "ring-2 ring-teal-400"
      )}
      onDragOver={
        canReorder
          ? (e) => {
              e.preventDefault()
              onDragOver?.(tutorial, e)
            }
          : undefined
      }
      onDrop={
        canReorder
          ? (e) => {
              e.preventDefault()
              onDrop?.(tutorial)
            }
          : undefined
      }
    >
      <div className="relative aspect-video overflow-hidden bg-slate-100">
        {tutorial.thumbnail_url ? (
          <img
            src={tutorial.thumbnail_url}
            alt={tutorial.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <Play className="h-12 w-12" />
          </div>
        )}
        {canReorder && (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-lg bg-white/90 p-0.5 shadow-sm">
            <button
              type="button"
              draggable
              title="Arrastar para reordenar"
              aria-label="Arrastar para reordenar"
              className="cursor-grab rounded-md p-1 text-slate-500 active:cursor-grabbing hover:bg-slate-100"
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move"
                e.dataTransfer.setData("text/plain", tutorial.id)
                onDragStart?.(tutorial)
              }}
              onDragEnd={onDragEnd}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={isFirst}
              title="Mover para cima"
              onClick={() => onMoveUp?.(tutorial)}
            >
              <ChevronUp className="h-4 w-4" />
              <span className="sr-only">Mover para cima</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={isLast}
              title="Mover para baixo"
              onClick={() => onMoveDown?.(tutorial)}
            >
              <ChevronDown className="h-4 w-4" />
              <span className="sr-only">Mover para baixo</span>
            </Button>
          </div>
        )}
      </div>
      <CardHeader className="flex-1">
        <CardTitle className="line-clamp-2">{tutorial.title}</CardTitle>
        <CardDescription className="line-clamp-2">{tutorial.description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-slate-500">{formatTutorialDate(tutorial.created_at)}</p>
      </CardContent>
      <CardFooter className="mt-auto gap-2">
        <Button asChild className="flex-1">
          <Link href={`/tutoriais/${tutorial.id}`}>
            <Play className="h-4 w-4" />
            Assistir tutorial
          </Link>
        </Button>
        {canManage && (
          <>
            <Button variant="secondary" size="icon" asChild title="Editar">
              <Link href={`/tutoriais/${tutorial.id}/editar`}>
                <Pencil className="h-4 w-4" />
                <span className="sr-only">Editar</span>
              </Link>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              title="Excluir"
              onClick={() => onDelete?.(tutorial)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Excluir</span>
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
