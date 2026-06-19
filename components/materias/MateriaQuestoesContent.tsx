"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ChevronDown, Folder, Plus, Trash2 } from "lucide-react"
import { useNotebookFolders } from "@/components/questions/NotebookFolderSelect"
import MateriaNotebookRow, {
  type MateriaNotebook,
} from "@/components/questions/MateriaNotebookRow"
import NotebookBulkToolbar from "@/components/questions/NotebookBulkToolbar"
import MoveNotebookModal from "@/components/questions/MoveNotebookModal"
import { useNotebookSelection } from "@/hooks/useNotebookSelection"
import { bulkDeleteNotebooks } from "@/lib/notebook-bulk-actions"

type FolderRow = {
  id: string
  name: string
  notebook_count: number
  question_total: number
  subfolder_count: number
}

type Props = {
  subjectId: string
  embedded?: boolean
}

function folderStatsLabel(notebookCount: number, questionTotal: number) {
  const cadernos = notebookCount === 1 ? "1 caderno" : `${notebookCount} cadernos`
  const questoes = questionTotal === 1 ? "1 questão" : `${questionTotal} questões`
  return `${cadernos} · ${questoes}`
}

export default function MateriaQuestoesContent({ subjectId, embedded = false }: Props) {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [allNotebooks, setAllNotebooks] = useState<MateriaNotebook[]>([])
  const [newFolderName, setNewFolderName] = useState("")
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [moveTarget, setMoveTarget] = useState<{ ids: string[]; label: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const allFolders = useNotebookFolders(userId, subjectId)

  const allIds = useMemo(() => allNotebooks.map((n) => n.id), [allNotebooks])
  const selection = useNotebookSelection(allIds)

  function reload(uid: string) {
    Promise.all([
      fetch(`/api/notebooks/folders?user_id=${uid}&subject_id=${subjectId}&root_only=1`).then(
        (r) => r.json()
      ),
      fetch(`/api/notebooks?user_id=${uid}&subject_id=${subjectId}`).then((r) => r.json()),
    ]).then(([f, n]) => {
      setFolders(f ?? [])
      setAllNotebooks(n ?? [])
    })
  }

  const rootNotebooks = useMemo(
    () => allNotebooks.filter((nb) => !nb.folder_id),
    [allNotebooks]
  )

  const notebooksByFolder = useMemo(() => {
    const map = new Map<string, MateriaNotebook[]>()
    for (const nb of allNotebooks) {
      if (!nb.folder_id) continue
      const list = map.get(nb.folder_id) ?? []
      list.push(nb)
      map.set(nb.folder_id, list)
    }
    return map
  }, [allNotebooks])

  const rootQuestionTotal = useMemo(
    () => rootNotebooks.reduce((sum, nb) => sum + nb.question_count, 0),
    [rootNotebooks]
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      reload(user.id)
    })
  }, [subjectId, router])

  async function createFolder() {
    if (!userId || !newFolderName.trim()) return
    await fetch("/api/notebooks/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        name: newFolderName.trim(),
        subject_id: subjectId,
      }),
    })
    setNewFolderName("")
    reload(userId)
  }

  async function deleteFolder(id: string) {
    if (
      !userId ||
      !confirm("Excluir subpasta? Os cadernos dentro voltam para a raiz da matéria.")
    )
      return
    await fetch(`/api/notebooks/folders?id=${id}`, { method: "DELETE" })
    reload(userId)
  }

  async function deleteNotebook(id: string) {
    if (!userId || !confirm("Excluir caderno?")) return
    await fetch(`/api/notebooks/${id}`, { method: "DELETE" })
    selection.clear()
    reload(userId)
  }

  async function bulkDelete() {
    if (!userId || selection.selectedCount === 0) return
    if (!confirm(`Excluir ${selection.selectedCount} caderno(s)?`)) return
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

  return (
    <div className={embedded ? "" : "p-6"}>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={`/questoes/importar?subject_id=${subjectId}`}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
        >
          <Plus className="h-4 w-4" /> Importar PDF
        </Link>
        {!embedded && (
          <Link
            href="/questoes"
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"
          >
            Voltar às questões
          </Link>
        )}
      </div>

      <NotebookBulkToolbar
        selectedCount={selection.selectedCount}
        totalCount={allNotebooks.length}
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

      <section className="mt-6">
        <h2 className="mb-3 font-semibold text-slate-700">Subpastas</h2>
        <div className="mb-3 flex gap-2">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Nova subpasta"
            className="rounded border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={createFolder}
            className="rounded bg-slate-100 px-3 py-2 text-sm"
          >
            Criar
          </button>
        </div>
        {folders.map((f) => {
          const expanded = expandedFolders[f.id] ?? false
          const folderNotebooks = notebooksByFolder.get(f.id) ?? []
          const notebookCount = folderNotebooks.length || f.notebook_count
          const questionTotal =
            folderNotebooks.reduce((sum, nb) => sum + nb.question_count, 0) ||
            f.question_total ||
            0

          return (
            <div key={f.id} className="mb-2">
              <div className="flex items-center justify-between rounded-lg border bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedFolders((prev) => ({ ...prev, [f.id]: !prev[f.id] }))
                  }
                  className="flex flex-1 items-center gap-2 text-left hover:text-blue-700"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform ${
                      expanded ? "" : "-rotate-90"
                    }`}
                  />
                  <Folder className="h-5 w-5 shrink-0 text-slate-400" />
                  <span className="font-medium">{f.name}</span>
                  <span className="text-sm text-slate-500">
                    {folderStatsLabel(notebookCount, questionTotal)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteFolder(f.id)}
                  className="ml-2 text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {expanded && userId && (
                <div className="mt-2 space-y-0">
                  {folderNotebooks.map((nb) => (
                    <MateriaNotebookRow
                      key={nb.id}
                      notebook={nb}
                      userId={userId}
                      subjectId={subjectId}
                      folders={allFolders}
                      onMoved={() => reload(userId)}
                      onDelete={deleteNotebook}
                      nested
                      selected={selection.isSelected(nb.id)}
                      onToggleSelect={() => selection.toggle(nb.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold text-slate-700">Cadernos na raiz</h2>
        {userId &&
          rootNotebooks.map((nb) => (
            <MateriaNotebookRow
              key={nb.id}
              notebook={nb}
              userId={userId}
              subjectId={subjectId}
              folders={allFolders}
              onMoved={() => reload(userId)}
              onDelete={deleteNotebook}
              selected={selection.isSelected(nb.id)}
              onToggleSelect={() => selection.toggle(nb.id)}
            />
          ))}
        {rootNotebooks.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum caderno na raiz.</p>
        )}
      </section>

      {userId && moveTarget && (
        <MoveNotebookModal
          isOpen
          onClose={() => setMoveTarget(null)}
          userId={userId}
          notebookIds={moveTarget.ids.length > 1 ? moveTarget.ids : undefined}
          notebookId={moveTarget.ids.length === 1 ? moveTarget.ids[0] : undefined}
          notebookName={moveTarget.label}
          initialSubjectId={subjectId}
          onMoved={() => {
            selection.clear()
            reload(userId)
          }}
        />
      )}
    </div>
  )
}
