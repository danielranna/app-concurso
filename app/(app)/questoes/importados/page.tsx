"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { FileStack, Play, Trash2 } from "lucide-react"
import OrganizeContentModal from "@/components/shared-assets/OrganizeContentModal"
import MoveNotebookModal from "@/components/questions/MoveNotebookModal"
import NotebookBulkToolbar from "@/components/questions/NotebookBulkToolbar"
import { useNotebookSelection } from "@/hooks/useNotebookSelection"
import { bulkDeleteNotebooks } from "@/lib/notebook-bulk-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  QuestoesEmptyState,
  QuestoesPageHeader,
} from "@/components/questions/questoes-shell"
import { cn } from "@/lib/utils"

type Notebook = {
  id: string
  name: string
  question_count: number
  answered_count: number
  completed_at: string | null
}

export default function ImportadosPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [moveTarget, setMoveTarget] = useState<{ ids: string[]; label: string } | null>(null)
  const [organizeNotebook, setOrganizeNotebook] = useState<Notebook | null>(null)
  const [busy, setBusy] = useState(false)

  const allIds = useMemo(() => notebooks.map((n) => n.id), [notebooks])
  const selection = useNotebookSelection(allIds)

  function reload(uid: string) {
    fetch(`/api/notebooks?user_id=${uid}&unassigned=1`).then((r) => r.json()).then(setNotebooks)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      reload(user.id)
    })
  }, [router])

  async function deleteNotebook(id: string) {
    if (!userId || !confirm("Excluir este caderno? As questões permanecem no banco global.")) return
    await fetch(`/api/notebooks/${id}`, { method: "DELETE" })
    selection.clear()
    reload(userId)
  }

  async function bulkDelete() {
    if (!userId || selection.selectedCount === 0) return
    const n = selection.selectedCount
    if (
      !confirm(
        `Excluir ${n} caderno(s)? As questões permanecem no banco global.`
      )
    )
      return
    setBusy(true)
    try {
      await bulkDeleteNotebooks(selection.selectedIds)
      selection.clear()
      reload(userId)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao excluir")
    } finally {
      setBusy(false)
    }
  }

  function afterBulkAction() {
    if (!userId) return
    selection.clear()
    reload(userId)
  }

  return (
    <div className="space-y-6">
      <QuestoesPageHeader
        title="Cadernos importados"
        description="Cadernos ainda sem vínculo com sua matéria. Selecione vários para mover ou excluir de uma vez."
      />

      <NotebookBulkToolbar
        selectedCount={selection.selectedCount}
        totalCount={notebooks.length}
        allSelected={selection.allSelected}
        onSelectAll={selection.selectAll}
        onClear={selection.clear}
        onMove={() =>
          setMoveTarget({
            ids: selection.selectedIds,
            label: `${selection.selectedCount} cadernos`,
          })
        }
        onDelete={bulkDelete}
        busy={busy}
      />

      <div className="space-y-2">
        {notebooks.map((nb) => {
          const checked = selection.isSelected(nb.id)
          const pct =
            nb.question_count > 0
              ? Math.round((nb.answered_count / nb.question_count) * 100)
              : 0
          return (
            <Card
              key={nb.id}
              className={cn(checked && "border-teal-300 ring-1 ring-teal-200")}
            >
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => selection.toggle(nb.id)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30"
                  aria-label={`Selecionar ${nb.name}`}
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{nb.name}</p>
                    {nb.completed_at && <Badge variant="success">Concluído</Badge>}
                  </div>
                  <p className="text-sm text-slate-500">
                    {nb.answered_count}/{nb.question_count} respondidas
                  </p>
                  {nb.question_count > 0 && <Progress value={pct} className="h-1 max-w-xs" />}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setMoveTarget({ ids: [nb.id], label: nb.name })}
                >
                  Mover para outra pasta…
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-violet-200 text-violet-800 hover:bg-violet-50"
                  onClick={() => setOrganizeNotebook(nb)}
                >
                  <FileStack className="h-4 w-4" />
                  Organizar conteúdos
                </Button>
                <Button size="sm" asChild>
                  <Link href={`/questoes/cadernos/${nb.id}`}>
                    <Play className="h-4 w-4" />
                    Resolver
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => deleteNotebook(nb.id)}
                  title="Excluir caderno"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              </CardContent>
            </Card>
          )
        })}
        {notebooks.length === 0 && (
          <QuestoesEmptyState
            title="Nenhum caderno pendente"
            action={
              <Button asChild>
                <Link href="/questoes/importar">Importar PDF</Link>
              </Button>
            }
          />
        )}
      </div>

      {userId && moveTarget && (
        <MoveNotebookModal
          isOpen
          onClose={() => setMoveTarget(null)}
          userId={userId}
          notebookIds={moveTarget.ids.length > 1 ? moveTarget.ids : undefined}
          notebookId={moveTarget.ids.length === 1 ? moveTarget.ids[0] : undefined}
          notebookName={moveTarget.label}
          onMoved={afterBulkAction}
        />
      )}

      {userId && organizeNotebook && (
        <OrganizeContentModal
          userId={userId}
          notebookId={organizeNotebook.id}
          notebookName={organizeNotebook.name}
          onClose={() => setOrganizeNotebook(null)}
        />
      )}
    </div>
  )
}
