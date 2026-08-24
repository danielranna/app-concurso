"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { clearDraftScope, draftScopeKey } from "@/lib/question-draft-cache"
import QuestionSolver from "@/components/questions/QuestionSolver"
import EditQuestionModal from "@/components/questions/EditQuestionModal"
import type { ConfidenceLevel } from "@/lib/question-types"
import type { NavMode } from "@/lib/study-navigation"

type AttemptInfo = {
  is_correct: boolean
  selected_answer: string
  duration_ms: number | null
  confidence_level: string | null
}

type QueueItem = {
  question_id: string
  tec_id: number
  notebook_id: string
  position: number
  short_id: string
  statement?: string
  correct_answer?: string
  type?: string
  tec_url?: string
  attempt?: AttemptInfo | null
}

function formatLetter(value: string | null | undefined, type?: string) {
  const raw = String(value || "").trim()
  if (!raw) return "—"
  if (type === "certo_errado") {
    const l = raw.toLowerCase()
    if (l === "c" || l.startsWith("certo")) return "Certo"
    if (l === "e" || l.startsWith("errado")) return "Errado"
  }
  return raw.toUpperCase().slice(0, 8)
}

function OmissasResults({ queue, attempts }: { queue: QueueItem[]; attempts: Record<string, AttemptInfo> }) {
  const total = queue.length
  const resolved = Object.keys(attempts).length
  const correct = Object.values(attempts).filter((a) => a.is_correct).length
  const wrong = resolved - correct

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-lg font-medium text-green-800">Sessão de omissas concluída</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <div className="min-w-[88px] rounded-lg bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <span className="block text-2xl font-semibold tabular-nums text-emerald-700">{correct}</span>
            acertos
          </div>
          <div className="min-w-[88px] rounded-lg bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <span className="block text-2xl font-semibold tabular-nums text-red-700">{wrong}</span>
            erros
          </div>
          <div className="min-w-[88px] rounded-lg bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <span className="block text-2xl font-semibold tabular-nums text-slate-800">{total}</span>
            no total
          </div>
        </div>
      </div>

      <ul className="space-y-3">
        {queue.map((q) => {
          const att = attempts[q.question_id]
          const ok = att?.is_correct
          return (
            <li
              key={q.question_id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">
                  {q.short_id ? `#${q.short_id}` : `TEC ${q.tec_id}`}
                </p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    ok === true
                      ? "bg-emerald-50 text-emerald-800"
                      : ok === false
                        ? "bg-red-50 text-red-800"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {ok === true ? "Acerto" : ok === false ? "Erro" : "—"}
                </span>
              </div>
              {q.statement ? (
                <p className="mt-2 line-clamp-4 text-sm text-slate-700">{q.statement}</p>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">
                Sua resposta: {formatLetter(att?.selected_answer, q.type)}
                {ok === false ? ` · Gabarito: ${formatLetter(q.correct_answer, q.type)}` : ""}
              </p>
              {q.tec_url ? (
                <a
                  href={q.tec_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-blue-600 hover:underline"
                >
                  Ver no TEC
                </a>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function OmissasAppPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("t") || searchParams.get("token") || ""
  const [userId, setUserId] = useState<string | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [index, setIndex] = useState(0)
  const [answered, setAnswered] = useState<Set<string>>(new Set())
  const [attempts, setAttempts] = useState<Record<string, AttemptInfo>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editQuestionId, setEditQuestionId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

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
      const nextQueue: QueueItem[] = Array.isArray(data.queue) ? data.queue : []
      clearDraftScope(draftScopeKey("solo", token || "omissas"))
      setQueue(nextQueue)
      setAttempts({})
      setAnswered(new Set())
      setIndex(0)
      setLoading(false)
    })
  }, [router, token])

  const currentItem = queue[index] ?? null
  const allDone = queue.length > 0 && queue.every((q) => answered.has(q.question_id))
  const stats = useMemo(() => {
    const total = queue.length
    const resolved = answered.size
    const correct = Object.values(attempts).filter((a) => a.is_correct).length
    return {
      total,
      resolved,
      correct,
      wrong: Math.max(0, resolved - correct),
      pending: Math.max(0, total - resolved),
    }
  }, [queue, answered, attempts])

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
      const pendingLeft = queue.some((q) => !answered.has(q.question_id))
      let next = index
      if (opts?.nav === "next") next = Math.min(queue.length - 1, index + 1)
      if (opts?.nav === "prev") next = Math.max(0, index - 1)
      if (opts?.nav === "random") {
        next = Math.floor(Math.random() * queue.length)
      }
      if (opts?.nav === "unsolved") {
        const u = queue.findIndex((q, i) => i >= index && !answered.has(q.question_id))
        next = u >= 0 ? u : queue.findIndex((q) => !answered.has(q.question_id))
        if (next < 0) {
          return { current: null, question: null, options: [], stats }
        }
      } else if (!pendingLeft && !opts?.nav) {
        return { current: null, question: null, options: [], stats }
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
        attempt: attempts[item.question_id] ?? null,
      }
    },
    [userId, queue, index, answered, stats, attempts]
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
        setAttempts((prev) => ({
          ...prev,
          [payload.question_id]: {
            is_correct: Boolean(data.is_correct),
            selected_answer: payload.selected_answer,
            duration_ms: payload.duration_ms,
            confidence_level: payload.confidence_level,
          },
        }))
      }
      return data
    },
    [queue, userId]
  )

  function openEditForQuestion(questionId: string) {
    setEditQuestionId(questionId)
    setShowEditModal(true)
  }

  function openEditForCurrent() {
    const qid = currentItem?.question_id
    if (qid) openEditForQuestion(qid)
  }

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
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Omissas / atrasadas</h1>
        {!allDone && currentItem ? (
          <button
            type="button"
            onClick={openEditForCurrent}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            <Pencil className="h-4 w-4" /> Editar questão
          </button>
        ) : null}
      </div>
      <p className="mb-6 text-sm text-slate-500">
        {allDone
          ? "Sessão encerrada — resumo das respostas desta fila."
          : "Fila do dia — não entra na biblioteca. Cada resposta grava no caderno de origem e no WhatsApp."}
      </p>
      {queue.length === 0 ? (
        <p className="text-sm text-slate-600">
          Nenhuma questão desta sessão está no banco deste app (importe o caderno ou mapeie o
          TEC).
        </p>
      ) : allDone ? (
        <OmissasResults queue={queue} attempts={attempts} />
      ) : (
        <QuestionSolver
          userId={userId}
          mode="solo"
          soloQuestionId={token || "omissas"}
          fetchQueue={fetchQueue}
          submitAnswer={submitAnswer}
          onEditQuestion={openEditForQuestion}
          refreshKey={refreshKey}
          whatsappOverlay={{
            enabled: true,
            shortId: currentItem?.short_id ?? null,
            notebookId: currentItem?.notebook_id || undefined,
          }}
        />
      )}

      {userId && editQuestionId && (
        <EditQuestionModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false)
            setEditQuestionId(null)
          }}
          userId={userId}
          questionId={editQuestionId}
          notebookId={
            queue.find((q) => q.question_id === editQuestionId)?.notebook_id || undefined
          }
          onSaved={() => setRefreshKey((k) => k + 1)}
          onDeleted={() => {
            const removedId = editQuestionId
            clearDraftScope(draftScopeKey("solo", token || "omissas"))
            setQueue((prev) => {
              const next = prev.filter((q) => q.question_id !== removedId)
              setIndex((i) => Math.min(i, Math.max(0, next.length - 1)))
              return next
            })
            setAnswered((prev) => {
              const next = new Set(prev)
              if (removedId) next.delete(removedId)
              return next
            })
            setAttempts((prev) => {
              if (!removedId) return prev
              const next = { ...prev }
              delete next[removedId]
              return next
            })
            setRefreshKey((k) => k + 1)
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
