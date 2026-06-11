"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, FileStack, Play, Trash2 } from "lucide-react"
import OrganizeContentModal from "@/components/shared-assets/OrganizeContentModal"
import MoveNotebookModal from "@/components/questions/MoveNotebookModal"
import NotebookBulkToolbar from "@/components/questions/NotebookBulkToolbar"
import { useNotebookSelection } from "@/hooks/useNotebookSelection"
import { bulkDeleteNotebooks } from "@/lib/notebook-bulk-actions"

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
    <div className="p-6">
      <Link href="/questoes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="text-2xl font-bold">Cadernos importados</h1>
      <p className="mt-1 text-sm text-slate-600">
        Cadernos ainda sem vínculo com sua matéria. Selecione vários para mover ou excluir de uma vez.
      </p>

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

      <div className="mt-6 space-y-3">
        {notebooks.map((nb) => {
          const checked = selection.isSelected(nb.id)
          return (
            <div
              key={nb.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 ${
                checked ? "border-slate-400 ring-1 ring-slate-300" : ""
              }`}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => selection.toggle(nb.id)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                  aria-label={`Selecionar ${nb.name}`}
                />
                <div className="min-w-0">
                  <p className="font-semibold text-blue-700">{nb.name}</p>
                  <p className="text-sm text-slate-500">
                    {nb.answered_count}/{nb.question_count} respondidas
                    {nb.completed_at && " · Concluído"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMoveTarget({ ids: [nb.id], label: nb.name })}
                  className="rounded border px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  Mover para outra pasta…
                </button>
                <button
                  type="button"
                  onClick={() => setOrganizeNotebook(nb)}
                  className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm text-violet-800 hover:bg-violet-100"
                >
                  <FileStack className="h-4 w-4" /> Organizar conteúdos
                </button>
                <Link
                  href={`/questoes/cadernos/${nb.id}`}
                  className="inline-flex items-center gap-1 rounded bg-green-600 px-3 py-1.5 text-sm text-white"
                >
                  <Play className="h-4 w-4" /> Resolver
                </Link>
                <button
                  type="button"
                  onClick={() => deleteNotebook(nb.id)}
                  className="inline-flex items-center gap-1 rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                  title="Excluir caderno"
                >
                  <Trash2 className="h-4 w-4" /> Excluir
                </button>
              </div>
            </div>
          )
        })}
        {notebooks.length === 0 && (
          <p className="text-slate-500">
            Nenhum caderno pendente.{" "}
            <Link href="/questoes/importar" className="text-blue-600 underline">
              Importar PDF
            </Link>
          </p>
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
