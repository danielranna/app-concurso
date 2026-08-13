"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { supabase } from "@/lib/supabase"
import QuestionSolver from "@/components/questions/QuestionSolver"
import type { ConfidenceLevel } from "@/lib/question-types"
import type { NavMode } from "@/lib/study-navigation"

type QueueItem = {
  question_id: string
  tec_id: number
  notebook_id: string
  position: number
  short_id: string
}

function OmissasAppPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("t") || searchParams.get("token") || ""
  const [userId, setUserId] = useState<string | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [index, setIndex] = useState(0)
  const [answered, setAnswered] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      if (!token) {
        setError("Link inválido: falta o token da sessão.")
        setLoading(false)
        return
      }
      const res = await fetch(
        `/api/quiz-sync/omissas?t=${encodeURIComponent(token)}&user_id=${user.id}`
      )
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Não foi possível carregar a fila.")
        setLoading(false)
        return
      }
      setQueue(Array.isArray(data.queue) ? data.queue : [])
      setLoading(false)
    })
  }, [router, token])

  const currentItem = queue[index] ?? null
  const stats = useMemo(() => {
    const total = queue.length
    const resolved = answered.size
    return {
      total,
      resolved,
      correct: 0,
      wrong: 0,
      pending: Math.max(0, total - resolved),
    }
  }, [queue, answered])

  const fetchQueue = useCallback(
    async (opts?: { nav?: NavMode }) => {
      if (!userId || queue.length === 0) {
        return {
          current: null,
          question: null,
          options: [],
          stats,
        }
      }
      let next = index
      if (opts?.nav === "next") next = Math.min(queue.length - 1, index + 1)
      if (opts?.nav === "prev") next = Math.max(0, index - 1)
      if (opts?.nav === "unsolved") {
        const u = queue.findIndex((q, i) => i >= index && !answered.has(q.question_id))
        next = u >= 0 ? u : queue.findIndex((q) => !answered.has(q.question_id))
        if (next < 0) next = index
      }
      if (next !== index) setIndex(next)
      const item = queue[next] ?? queue[index]
      if (!item) {
        return { current: null, question: null, options: [], stats }
      }
      const res = await fetch(`/api/questions/${item.question_id}?user_id=${userId}`)
      const data = await res.json()
      return {
        current: {
          question_id: item.question_id,
          tec_id: item.tec_id,
          notebook_id: item.notebook_id,
          short_id: item.short_id,
        },
        question: data.question ?? null,
        options: data.options ?? [],
        stats,
        position: next + 1,
      }
    },
    [userId, queue, index, answered, stats]
  )

  const submitAnswer = useCallback(
    async (payload: {
      question_id: string
      selected_answer: string
      duration_ms: number
      tec_id: number
      notebook_id?: string
      confidence_level: ConfidenceLevel
      tags?: string[]
      comment?: string | null
    }) => {
      const item = queue.find((q) => q.question_id === payload.question_id)
      const notebookId = payload.notebook_id || item?.notebook_id
      const url = notebookId
        ? `/api/notebooks/${notebookId}/answer`
        : "/api/quiz-sync/solve"
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          ...payload,
          notebook_id: notebookId || null,
        }),
      })
      const data = await res.json()
      if (!("error" in data)) {
        setAnswered((prev) => new Set(prev).add(payload.question_id))
      }
      return data
    },
    [queue, userId]
  )

  if (!userId || loading) return <p className="p-6 text-slate-700">Carregando omissas…</p>
  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/questoes" className="mt-4 inline-block text-sm text-slate-600">
          Voltar
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/questoes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="mb-1 text-xl font-bold text-slate-900">Omissas / atrasadas</h1>
      <p className="mb-6 text-sm text-slate-500">
        Fila do dia — não entra na biblioteca. Cada resposta grava no caderno de origem e no
        WhatsApp.
      </p>
      {queue.length === 0 ? (
        <p className="text-sm text-slate-600">
          Nenhuma questão desta sessão está no banco deste app (importe o caderno ou mapeie o
          TEC).
        </p>
      ) : (
        <QuestionSolver
          userId={userId}
          mode="solo"
          soloQuestionId={token || "omissas"}
          fetchQueue={fetchQueue}
          submitAnswer={submitAnswer}
          whatsappOverlay={{
            enabled: true,
            shortId: currentItem?.short_id ?? null,
            notebookId: currentItem?.notebook_id || undefined,
          }}
        />
      )}
    </div>
  )
}

export default function OmissasPage() {
  return (
    <Suspense fallback={<p className="p-6 text-slate-700">Carregando omissas…</p>}>
      <OmissasAppPage />
    </Suspense>
  )
}
