"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Folder, Play, Plus, Trash2 } from "lucide-react"

type FolderRow = {
  id: string
  name: string
  notebook_count: number
  subfolder_count: number
}

type NotebookRow = {
  id: string
  name: string
  question_count: number
  answered_count: number
  completed_at: string | null
}

export default function MateriaQuestoesPage() {
  const params = useParams()
  const subjectId = params.subjectId as string
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [subjectName, setSubjectName] = useState("")
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [notebooks, setNotebooks] = useState<NotebookRow[]>([])
  const [newFolderName, setNewFolderName] = useState("")

  function reload(uid: string) {
    Promise.all([
      fetch(`/api/notebooks/folders?user_id=${uid}&subject_id=${subjectId}&root_only=1`).then(
        (r) => r.json()
      ),
      fetch(
        `/api/notebooks?user_id=${uid}&subject_id=${subjectId}&root_only=1`
      ).then((r) => r.json()),
      fetch(`/api/subjects?user_id=${uid}`).then((r) => r.json()),
    ]).then(([f, n, subs]) => {
      setFolders(f ?? [])
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
    if (!userId || !confirm("Excluir pasta?")) return
    await fetch(`/api/notebooks/folders?id=${id}`, { method: "DELETE" })
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
        {folders.map((f) => (
          <div
            key={f.id}
            className="mb-2 flex items-center justify-between rounded-lg border bg-white px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-slate-400" />
              <span className="font-medium">{f.name}</span>
              <span className="text-sm text-slate-500">
                {f.notebook_count} cadernos
              </span>
            </div>
            <button
              type="button"
              onClick={() => deleteFolder(f.id)}
              className="text-red-600 text-sm"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold text-slate-700">Cadernos</h2>
        {notebooks.map((nb) => (
          <div
            key={nb.id}
            className="mb-2 flex items-center justify-between rounded-lg border bg-white px-4 py-3"
          >
            <div>
              <p className="font-medium text-blue-700">{nb.name}</p>
              <p className="text-sm text-slate-500">
                {nb.answered_count}/{nb.question_count} respondidas
                {nb.completed_at && " · Concluído"}
              </p>
            </div>
            <div className="flex items-center gap-2">
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
          <p className="text-sm text-slate-500">Nenhum caderno nesta matéria.</p>
        )}
      </section>
    </div>
  )
}
