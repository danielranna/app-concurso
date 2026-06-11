"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, ChevronDown, Folder, Plus, Trash2 } from "lucide-react"
import { useNotebookFolders } from "@/components/questions/NotebookFolderSelect"
import MateriaNotebookRow, {
  type MateriaNotebook,
} from "@/components/questions/MateriaNotebookRow"

type FolderRow = {
  id: string
  name: string
  notebook_count: number
  question_total: number
  subfolder_count: number
}

function folderStatsLabel(notebookCount: number, questionTotal: number) {
  const cadernos =
    notebookCount === 1 ? "1 caderno" : `${notebookCount} cadernos`
  const questoes =
    questionTotal === 1 ? "1 questão" : `${questionTotal} questões`
  return `${cadernos} · ${questoes}`
}

export default function MateriaQuestoesPage() {
  const params = useParams()
  const subjectId = params.subjectId as string
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [subjectName, setSubjectName] = useState("")
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [allNotebooks, setAllNotebooks] = useState<MateriaNotebook[]>([])
  const [newFolderName, setNewFolderName] = useState("")
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const allFolders = useNotebookFolders(userId, subjectId)

  function reload(uid: string) {
    Promise.all([
      fetch(`/api/notebooks/folders?user_id=${uid}&subject_id=${subjectId}&root_only=1`).then(
        (r) => r.json()
      ),
      fetch(`/api/notebooks?user_id=${uid}&subject_id=${subjectId}`).then((r) => r.json()),
      fetch(`/api/subjects?user_id=${uid}`).then((r) => r.json()),
    ]).then(([f, n, subs]) => {
      setFolders(f ?? [])
      setAllNotebooks(n ?? [])
      const sub = (subs ?? []).find((s: { id: string }) => s.id === subjectId)
      setSubjectName(sub?.name ?? "Matéria")
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

  function toggleFolder(folderId: string) {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }))
  }

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
    setExpandedFolders((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    reload(userId)
  }

  async function deleteNotebook(id: string) {
    if (!userId || !confirm("Excluir caderno?")) return
    await fetch(`/api/notebooks/${id}`, { method: "DELETE" })
    reload(userId)
  }

  return (
    <div className="p-6">
      <Link
        href="/questoes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="text-2xl font-bold text-blue-700">{subjectName}</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/questoes/importar?subject_id=${subjectId}`}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
          title="Opcional: já salvar nesta matéria"
        >
          <Plus className="h-4 w-4" /> Importar PDF aqui
        </Link>
        <Link
          href="/questoes/importar"
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"
        >
          Importar (sem matéria)
        </Link>
      </div>

      <section className="mt-8">
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
                  onClick={() => toggleFolder(f.id)}
                  className="flex flex-1 items-center gap-2 text-left hover:text-blue-700"
                  aria-expanded={expanded}
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
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
                  className="ml-2 text-red-600 text-sm"
                  title="Excluir subpasta"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {expanded && userId && (
                <div className="mt-2 space-y-0">
                  <div className="mb-2 ml-6">
                    <Link
                      href={`/questoes/importar?subject_id=${subjectId}&folder_id=${f.id}`}
                      className="inline-flex items-center gap-1 text-xs text-slate-600 underline hover:text-slate-900"
                    >
                      <Plus className="h-3 w-3" /> Importar PDF nesta subpasta
                    </Link>
                  </div>
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
                    />
                  ))}
                  {folderNotebooks.length === 0 && (
                    <p className="ml-6 text-sm text-slate-500">Nenhum caderno nesta subpasta.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {folders.length === 0 && (
          <p className="text-sm text-slate-500">Nenhuma subpasta ainda.</p>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h2 className="font-semibold text-slate-700">Cadernos na raiz</h2>
          {rootNotebooks.length > 0 && (
            <span className="text-sm text-slate-500">
              {folderStatsLabel(rootNotebooks.length, rootQuestionTotal)}
            </span>
          )}
        </div>
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
            />
          ))}
        {rootNotebooks.length === 0 && (
          <p className="text-sm text-slate-500">
            Nenhum caderno na raiz — expanda uma subpasta ou importe um PDF.
          </p>
        )}
      </section>
    </div>
  )
}
