"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Trash2 } from "lucide-react"
import QuestionSolver from "@/components/questions/QuestionSolver"

export default function ResolverCadernoPage() {
  const params = useParams()
  const notebookId = params.id as string
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [mapping, setMapping] = useState<{
    subject_id: string
    topic_id: string
  } | null>(null)
  const [notebookName, setNotebookName] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      fetch(`/api/notebooks/${notebookId}`)
        .then((r) => r.json())
        .then((d) => setNotebookName(d.notebook?.name ?? ""))
    })
  }, [notebookId, router])

  const fetchQueueSimple = useCallback(async () => {
    if (!userId) {
      return {
        current: null,
        question: null,
        options: [],
        stats: { total: 0, resolved: 0, correct: 0, wrong: 0, pending: 0 },
      }
    }
    const res = await fetch(
      `/api/notebooks/${notebookId}/queue?user_id=${userId}`
    )
    const data = await res.json()
    let options: { label: string; text: string }[] = (data.options ?? []).map(
      (o: { label: string; text: string }) => ({ label: o.label, text: o.text })
    )
    const question = data.question
    if (question?.type === "certo_errado" && options.length === 0) {
      options = [
        { label: "Certo", text: "Certo" },
        { label: "Errado", text: "Errado" },
      ]
    }
    if (question && userId) {
      const params = new URLSearchParams({
        user_id: userId,
        resolve: "1",
        tec_subject: question.tec_subject ?? "",
      })
      if (question.tec_topic) params.set("tec_topic", question.tec_topic)
      const m = await fetch(`/api/questions/mappings?${params}`).then((r) => r.json())
      if (m?.subject_id) {
        setMapping({ subject_id: m.subject_id, topic_id: m.topic_id ?? "" })
      }
    }
    return {
      current: data.current ?? data.queue?.[0] ?? null,
      question,
      options,
      stats: data.stats,
    }
  }, [notebookId, userId])

  const submitAnswer = useCallback(
    async (payload: {
      question_id: string
      selected_answer: string
      duration_ms: number
    }) => {
      const res = await fetch(`/api/notebooks/${notebookId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          ...payload,
        }),
      })
      return res.json()
    },
    [notebookId, userId]
  )

  async function deleteNotebook() {
    if (!confirm("Excluir este caderno? As questões permanecem no banco global.")) return
    const res = await fetch(`/api/notebooks/${notebookId}`, { method: "DELETE" })
    if (res.ok) router.push("/questoes/importados")
  }

  if (!userId) return <p className="p-6">Carregando...</p>

  return (
    <div className="p-6">
      <Link
        href="/questoes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{notebookName}</h1>
        <button
          type="button"
          onClick={deleteNotebook}
          className="inline-flex items-center gap-1 rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" /> Excluir caderno
        </button>
      </div>
      <div className="mt-6">
        <QuestionSolver
          userId={userId}
          mode="notebook"
          notebookId={notebookId}
          fetchQueue={fetchQueueSimple}
          submitAnswer={submitAnswer}
          mapping={mapping}
        />
      </div>
    </div>
  )
}
