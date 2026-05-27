"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { supabase } from "@/lib/supabase"
import QuestionSolver from "@/components/questions/QuestionSolver"
import type { ConfidenceLevel } from "@/lib/question-types"
import { clearDraftScope, draftScopeKey } from "@/lib/question-draft-cache"

export default function ResolverQuestaoAvulsaPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const questionId = params.questionId as string
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const returnHref = searchParams.get("return") || "/questoes"

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
        stats: { total: 1, resolved: 0, correct: 0, wrong: 0, pending: 1 },
      }
    }
    const res = await fetch(
      `/api/questions/${questionId}?user_id=${userId}`
    )
    const data = await res.json()
    if (!res.ok || !data.question) {
      return {
        current: null,
        question: null,
        options: [],
        stats: { total: 0, resolved: 0, correct: 0, wrong: 0, pending: 0 },
      }
    }
    const q = data.question
    return {
      current: {
        question_id: q.id,
        tec_id: q.tec_id,
        notebook_id: "",
      },
      question: q,
      options: data.options ?? [],
      stats: { total: 1, resolved: 0, correct: 0, wrong: 0, pending: 1 },
      position: 1,
    }
  }, [userId, questionId])

  const submitAnswer = useCallback(
    async (payload: {
      question_id: string
      selected_answer: string
      duration_ms: number
      tec_id: number
      confidence_level: ConfidenceLevel
    }) => {
      if (!userId) return { error: "Não autenticado", is_correct: null }
      const res = await fetch(`/api/questions/${questionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          selected_answer: payload.selected_answer,
          duration_ms: payload.duration_ms,
          confidence_level: payload.confidence_level,
        }),
      })
      const data = await res.json()
      if (!res.ok) return { error: data.error ?? "Erro", is_correct: null }
      return data
    },
    [userId, questionId]
  )

  function handleRetry() {
    clearDraftScope(draftScopeKey("solo", questionId))
    setRefreshKey((k) => k + 1)
  }

  if (!userId) {
    return <p className="p-6 text-slate-500">Carregando…</p>
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={returnHref}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <button
          type="button"
          onClick={handleRetry}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Resolver de novo
        </button>
      </div>
      <QuestionSolver
        userId={userId}
        mode="solo"
        soloQuestionId={questionId}
        returnHref={returnHref}
        fetchQueue={fetchQueue}
        submitAnswer={submitAnswer}
        refreshKey={refreshKey}
      />
    </div>
  )
}
