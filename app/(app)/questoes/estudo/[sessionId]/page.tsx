"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft } from "lucide-react"
import QuestionSolver from "@/components/questions/QuestionSolver"

export default function EstudoCombinadoPage() {
  const params = useParams()
  const sessionId = params.sessionId as string
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionName, setSessionName] = useState("")
  const [childProgress, setChildProgress] = useState<
    { notebook_id: string; total: number; answered: number; completed_at: string | null; notebooks?: { name: string } }[]
  >([])
  const [mapping, setMapping] = useState<{
    subject_id: string
    topic_id: string
  } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
    })
  }, [router])

  const fetchQueue = useCallback(async () => {
    if (!userId) {
      return {
        current: null,
        question: null,
        options: [],
        stats: { total: 0, resolved: 0, correct: 0, wrong: 0, pending: 0 },
      }
    }
    const res = await fetch(
      `/api/study-sessions/${sessionId}/queue?user_id=${userId}`
    )
    const data = await res.json()
    setSessionName(data.session?.name ?? "")
    setChildProgress(data.child_progress ?? [])
    let options = data.options ?? []
    if (data.question?.type === "certo_errado" && options.length === 0) {
      options = [
        { label: "Certo", text: "Certo" },
        { label: "Errado", text: "Errado" },
      ]
    }
    if (data.question && userId) {
      const mRes = await fetch(`/api/questions/mappings?user_id=${userId}`)
      const mappings = await mRes.json()
      const m = (mappings ?? []).find(
        (x: { tec_subject: string; tec_topic: string | null }) =>
          x.tec_subject === data.question.tec_subject &&
          (x.tec_topic ?? "") === (data.question.tec_topic ?? "")
      )
      if (m) setMapping({ subject_id: m.subject_id, topic_id: m.topic_id ?? "" })
    }
    return {
      current: data.current,
      question: data.question,
      options,
      stats: data.stats,
      child_progress: data.child_progress,
    }
  }, [sessionId, userId])

  const submitAnswer = useCallback(
    async (payload: {
      question_id: string
      selected_answer: string
      duration_ms: number
      tec_id: number
      notebook_id?: string
    }) => {
      const res = await fetch(`/api/study-sessions/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          ...payload,
        }),
      })
      return res.json()
    },
    [sessionId, userId]
  )

  if (!userId) return <p className="p-6">Carregando...</p>

  return (
    <div className="p-6">
      <Link
        href="/questoes/semana"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="text-xl font-bold">{sessionName}</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {childProgress.map((c) => (
          <span
            key={c.notebook_id}
            className={`rounded-full px-3 py-1 text-xs ${
              c.completed_at ? "bg-green-100 text-green-800" : "bg-slate-100"
            }`}
          >
            {(c.notebooks as { name: string })?.name ?? "Caderno"}: {c.answered}/{c.total}
          </span>
        ))}
      </div>
      <div className="mt-6">
        <QuestionSolver
          userId={userId}
          mode="study"
          studySessionId={sessionId}
          fetchQueue={fetchQueue}
          submitAnswer={submitAnswer}
          mapping={mapping}
        />
      </div>
    </div>
  )
}
