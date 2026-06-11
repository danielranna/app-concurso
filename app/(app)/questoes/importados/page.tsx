"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, FileStack, Play, Trash2 } from "lucide-react"
import OrganizeContentModal from "@/components/shared-assets/OrganizeContentModal"

type Notebook = {
  id: string
  name: string
  question_count: number
  answered_count: number
  completed_at: string | null
}

type Subject = { id: string; name: string }

export default function ImportadosPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [assigning, setAssigning] = useState<string | null>(null)
  const [organizeNotebook, setOrganizeNotebook] = useState<Notebook | null>(null)

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
      fetch(`/api/subjects?user_id=${user.id}`)
        .then((r) => r.json())
        .then(setSubjects)
    })
  }, [router])

  async function deleteNotebook(id: string) {
    if (!userId || !confirm("Excluir este caderno? As questões permanecem no banco global.")) return
    await fetch(`/api/notebooks/${id}`, { method: "DELETE" })
    reload(userId)
  }

  async function assignSubject(notebookId: string, subjectId: string) {
    if (!subjectId) return
    setAssigning(notebookId)
    await fetch(`/api/notebooks/${notebookId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject_id: subjectId }),
    })
    if (userId) reload(userId)
    setAssigning(null)
  }

  return (
    <div className="p-6">
      <Link href="/questoes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="text-2xl font-bold">Cadernos importados</h1>
      <p className="mt-1 text-sm text-slate-600">
        Cadernos ainda sem vínculo com sua matéria. As questões já têm matéria/assunto do TEC — use{" "}
        <Link href="/questoes/mapeamento" className="text-blue-600 underline">
          Associar matérias e assuntos
        </Link>{" "}
        para ligar ao mapa de erros e filtros.
      </p>

      <div className="mt-6 space-y-3">
        {notebooks.map((nb) => (
          <div
            key={nb.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"
          >
            <div>
              <p className="font-semibold text-blue-700">{nb.name}</p>
              <p className="text-sm text-slate-500">
                {nb.answered_count}/{nb.question_count} respondidas
                {nb.completed_at && " · Concluído"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                disabled={assigning === nb.id}
                defaultValue=""
                onChange={(e) => assignSubject(nb.id, e.target.value)}
                className="rounded border px-2 py-1.5 text-sm"
                title="Mover para uma pasta de matéria"
              >
                <option value="">Mover para matéria…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
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
        ))}
        {notebooks.length === 0 && (
          <p className="text-slate-500">
            Nenhum caderno pendente.{" "}
            <Link href="/questoes/importar" className="text-blue-600 underline">
              Importar PDF
            </Link>
          </p>
        )}
      </div>

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
