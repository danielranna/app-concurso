"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Folder, Play, Plus, Trash2 } from "lucide-react"
import { useNotebookFolders } from "@/components/questions/NotebookFolderSelect"
import NotebookMoveControls from "@/components/questions/NotebookMoveControls"

type NotebookRow = {
  id: string
  name: string
  question_count: number
  answered_count: number
  completed_at: string | null
  folder_id: string | null
}

export default function MateriaPastaPage() {
  const params = useParams()
  const subjectId = params.subjectId as string
  const folderId = params.folderId as string
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [subjectName, setSubjectName] = useState("")
  const [folderName, setFolderName] = useState("")
  const [notebooks, setNotebooks] = useState<NotebookRow[]>([])
  const folders = useNotebookFolders(userId, subjectId)

  function reload(uid: string) {
    Promise.all([
      fetch(`/api/notebooks/folders?user_id=${uid}&subject_id=${subjectId}`).then((r) =>
        r.json()
      ),
      fetch(`/api/notebooks?user_id=${uid}&subject_id=${subjectId}&folder_id=${folderId}`).then(
        (r) => r.json()
      ),
      fetch(`/api/subjects?user_id=${uid}`).then((r) => r.json()),
    ]).then(([allFolders, n, subs]) => {
      const folder = (allFolders ?? []).find((f: { id: string }) => f.id === folderId)
      if (!folder) {
        router.replace(`/questoes/materia/${subjectId}`)
        return
      }
      setFolderName(folder.name)
      setNotebooks(n ?? [])
      const sub = (subs ?? []).find((s: { id: string }) => s.id === subjectId)
      setSubjectName(sub?.name ?? "Matéria")
    })
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
  }, [subjectId, folderId, router])

  async function deleteNotebook(id: string) {
    if (!userId || !confirm("Excluir caderno?")) return
    await fetch(`/api/notebooks/${id}`, { method: "DELETE" })
    reload(userId)
  }

  return (
    <div className="p-6">
      <Link
        href={`/questoes/materia/${subjectId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> {subjectName}
      </Link>
      <div className="flex items-center gap-2">
        <Folder className="h-6 w-6 text-slate-400" />
        <h1 className="text-2xl font-bold text-slate-800">{folderName}</h1>
      </div>
      <div className="mt-4">
        <Link
          href={`/questoes/importar?subject_id=${subjectId}&folder_id=${folderId}`}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
        >
          <Plus className="h-4 w-4" /> Importar PDF nesta subpasta
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold text-slate-700">Cadernos</h2>
        {notebooks.map((nb) => (
          <div
            key={nb.id}
            className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-4 py-3"
          >
            <div>
              <p className="font-medium text-blue-700">{nb.name}</p>
              <p className="text-sm text-slate-500">
                {nb.answered_count}/{nb.question_count} respondidas
                {nb.completed_at && " · Concluído"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {userId && (
                <NotebookMoveControls
                  userId={userId}
                  notebookId={nb.id}
                  notebookName={nb.name}
                  subjectId={subjectId}
                  currentFolderId={folderId}
                  folders={folders}
                  showSameSubjectRoot
                  onMoved={() => reload(userId)}
                />
              )}
              <Link
                href={`/questoes/cadernos/${nb.id}`}
                className="inline-flex items-center gap-1 rounded bg-green-600 px-3 py-1.5 text-sm text-white"
              >
                <Play className="h-4 w-4" /> Resolver
              </Link>
              <button
                type="button"
                onClick={() => deleteNotebook(nb.id)}
                className="text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {notebooks.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum caderno nesta subpasta.</p>
        )}
      </section>
    </div>
  )
}
