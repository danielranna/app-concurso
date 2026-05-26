"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Pencil } from "lucide-react"
import QuestionSolver from "@/components/questions/QuestionSolver"
import StudyTimer from "@/components/questions/StudyTimer"
import EditQuestionModal from "@/components/questions/EditQuestionModal"
import type { ConfidenceLevel } from "@/lib/question-types"
import type { NavMode } from "@/lib/study-navigation"

export default function EstudoCombinadoPage() {
  const params = useParams()
  const sessionId = params.sessionId as string
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionName, setSessionName] = useState("")
  const [elapsedMs, setElapsedMs] = useState(0)
  const [timerReady, setTimerReady] = useState(false)
  const [childProgress, setChildProgress] = useState<
    {
      notebook_id: string
      total: number
      answered: number
      completed_at: string | null
      notebooks?: { name: string }
    }[]
  >([])
  const [mapping, setMapping] = useState<{
    subject_id: string
    topic_id: string
  } | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editQuestionId, setEditQuestionId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      fetch(`/api/study-sessions/${sessionId}/queue?user_id=${user.id}`)
        .then((r) => r.json())
        .then((d) => {
          setSessionName(d.session?.name ?? "")
          setChildProgress(d.child_progress ?? [])
          setElapsedMs(d.study_elapsed_ms ?? 0)
          setTimerReady(true)
        })
    })
  }, [sessionId, router])

  const fetchQueue = useCallback(
    async (opts?: { nav?: NavMode }) => {
      if (!userId) {
        return {
          current: null,
          question: null,
          options: [],
          stats: { total: 0, resolved: 0, correct: 0, wrong: 0, pending: 0 },
        }
      }
      const qParams = new URLSearchParams({ user_id: userId })
      if (opts?.nav) qParams.set("nav", opts.nav)
      const res = await fetch(`/api/study-sessions/${sessionId}/queue?${qParams}`)
      const data = await res.json()
      setSessionName(data.session?.name ?? "")
      setChildProgress(data.child_progress ?? [])
      const options = data.options ?? []
      if (data.question && userId) {
        const mParams = new URLSearchParams({
          user_id: userId,
          resolve: "1",
          tec_subject: data.question.tec_subject ?? "",
        })
        if (data.question.tec_topic) mParams.set("tec_topic", data.question.tec_topic)
        const m = await fetch(`/api/questions/mappings?${mParams}`).then((r) => r.json())
        if (m?.subject_id) {
          setMapping({ subject_id: m.subject_id, topic_id: m.topic_id ?? "" })
        }
      }
      return {
        current: data.current,
        question: data.question,
        options,
        stats: data.stats,
        position: data.position,
      }
    },
    [sessionId, userId]
  )

  const persistElapsed = useCallback(
    async (ms: number) => {
      if (!userId) return
      setElapsedMs(ms)
      await fetch(`/api/study-sessions/${sessionId}/timer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, study_elapsed_ms: ms }),
      })
    },
    [sessionId, userId]
  )

  const submitAnswer = useCallback(
    async (payload: {
      question_id: string
      selected_answer: string
      duration_ms: number
      tec_id: number
      notebook_id?: string
      confidence_level: ConfidenceLevel
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

  function openEditForQuestion(questionId: string) {
    setEditQuestionId(questionId)
    setShowEditModal(true)
  }

  function openEditForCurrent() {
    fetch(`/api/study-sessions/${sessionId}/queue?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => {
        const qid = d.current?.question_id ?? d.question?.id
        if (qid) openEditForQuestion(qid)
      })
  }

  if (!userId) return <p className="p-6">Carregando...</p>

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link
        href="/questoes/semana"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{sessionName}</h1>
          {timerReady && (
            <StudyTimer initialMs={elapsedMs} onPersist={persistElapsed} />
          )}
        </div>
        <button
          type="button"
          onClick={openEditForCurrent}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          <Pencil className="h-4 w-4" /> Editar questão
        </button>
      </div>
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
          onEditQuestion={openEditForQuestion}
          refreshKey={refreshKey}
        />
      </div>

      {userId && editQuestionId && (
        <EditQuestionModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false)
            setEditQuestionId(null)
          }}
          userId={userId}
          questionId={editQuestionId}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
