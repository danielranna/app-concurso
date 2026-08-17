import Link from "next/link"
import { Pencil, Play, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatTutorialDate, type Tutorial } from "@/lib/tutorials"

type Props = {
  tutorial: Tutorial
  canManage?: boolean
  onDelete?: (tutorial: Tutorial) => void
}

export default function TutorialCard({ tutorial, canManage, onDelete }: Props) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
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
