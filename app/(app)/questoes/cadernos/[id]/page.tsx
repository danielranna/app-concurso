"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Bookmark, Pencil, RotateCcw, Trash2 } from "lucide-react"
import { clearDraftScope, draftScopeKey } from "@/lib/question-draft-cache"
import QuestionSolver from "@/components/questions/QuestionSolver"
import StudyTimer from "@/components/questions/StudyTimer"
import SaveNotebookModal from "@/components/questions/SaveNotebookModal"
import EditQuestionModal from "@/components/questions/EditQuestionModal"
import type { ConfidenceLevel } from "@/lib/question-types"
import type { NavMode } from "@/lib/study-navigation"

type NotebookMeta = {
  name: string
  subject_id: string | null
  library_saved?: boolean
}

export default function ResolverCadernoPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const notebookId = params.id as string
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [mapping, setMapping] = useState<{
    subject_id: string
    topic_id: string
  } | null>(null)
  const [notebook, setNotebook] = useState<NotebookMeta | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [timerReady, setTimerReady] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editQuestionId, setEditQuestionId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [creatingWrong, setCreatingWrong] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [timerKey, setTimerKey] = useState(0)
  const [lastStats, setLastStats] = useState({
    wrong: 0,
    correct: 0,
    total: 0,
    pending: 0,
  })
  const [timerPaused, setTimerPaused] = useState(false)

  function reloadNotebook() {
    fetch(`/api/notebooks/${notebookId}`)
      .then((r) => r.json())
      .then((d) => {
        const nb = d.notebook
        if (nb) {
          setNotebook({
            name: nb.name ?? "",
            subject_id: nb.subject_id ?? null,
            library_saved: nb.library_saved !== false,
          })
        }
      })
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      reloadNotebook()
      fetch(`/api/notebooks/${notebookId}/queue?user_id=${user.id}`)
        .then((r) => r.json())
        .then((d) => {
          setElapsedMs(d.study_elapsed_ms ?? 0)
          setTimerReady(true)
          if (d.stats) {
            setLastStats(d.stats)
            if (d.stats.pending === 0 && d.stats.total > 0) setTimerPaused(true)
          }
        })
    })
  }, [notebookId, router])

  const handleNotebookComplete = useCallback(() => {
    setTimerPaused(true)
  }, [])

  useEffect(() => {
    if (searchParams.get("save") === "1" && notebook?.library_saved === false) {
      setShowSaveModal(true)
    }
  }, [searchParams, notebook?.library_saved])

  const fetchQueueSimple = useCallback(
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
      const res = await fetch(`/api/notebooks/${notebookId}/queue?${qParams}`)
      const data = await res.json()
      const options: { label: string; text: string }[] = (data.options ?? []).map(
        (o: { label: string; text: string }) => ({ label: o.label, text: o.text })
      )
      const question = data.question
      if (data.stats) setLastStats(data.stats)
      if (question && userId) {
        const mParams = new URLSearchParams({
          user_id: userId,
          resolve: "1",
          tec_subject: question.tec_subject ?? "",
        })
        if (question.tec_topic) mParams.set("tec_topic", question.tec_topic)
        const m = await fetch(`/api/questions/mappings?${mParams}`).then((r) => r.json())
        if (m?.subject_id) {
          setMapping({ subject_id: m.subject_id, topic_id: m.topic_id ?? "" })
        }
      }
      return {
        current: data.current ?? data.queue?.[0] ?? null,
        question,
        options,
        stats: data.stats,
        position: data.position,
      }
    },
    [notebookId, userId]
  )

  const persistElapsed = useCallback(
    async (ms: number) => {
      if (!userId) return
      setElapsedMs(ms)
      await fetch(`/api/notebooks/${notebookId}/timer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, study_elapsed_ms: ms }),
      })
    },
    [notebookId, userId]
  )

  const submitAnswer = useCallback(
    async (payload: {
      question_id: string
      selected_answer: string
      duration_ms: number
      tec_id: number
      confidence_level: ConfidenceLevel
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
    if (res.ok) router.push("/questoes")
  }

  async function createWrongNotebook() {
    if (!userId) return
    setCreatingWrong(true)
    const res = await fetch(`/api/notebooks/${notebookId}/from-wrong`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
    const data = await res.json()
    setCreatingWrong(false)
    if (data.notebook_id) router.push(`/questoes/cadernos/${data.notebook_id}`)
    else alert(data.error ?? "Erro ao criar caderno")
  }

  const resetNotebook = useCallback(
    async (mode: "all" | "wrong") => {
      if (!userId || resetting) return
      const labels = {
        all: "Zerar o cronômetro e todas as respostas deste caderno? Você poderá refazê-lo do zero.",
        wrong: `Zerar apenas as ${lastStats.wrong} questão(ões) errada(s)? As acertadas permanecem.`,
      }
      if (!confirm(labels[mode])) return

      setResetting(true)
      const res = await fetch(`/api/notebooks/${notebookId}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          mode,
          reset_timer: mode === "all",
        }),
      })
      const data = await res.json()
      setResetting(false)

      if (!res.ok) {
        alert(data.error ?? "Erro ao zerar caderno")
        return
      }

      clearDraftScope(draftScopeKey("notebook", notebookId))
      if (mode === "all") {
        setElapsedMs(0)
        setTimerKey((k) => k + 1)
      }
      setTimerPaused(false)
      setRefreshKey((k) => k + 1)
      const qRes = await fetch(`/api/notebooks/${notebookId}/queue?user_id=${userId}`)
      const qData = await qRes.json()
      if (qData.stats) setLastStats(qData.stats)
      if (mode === "all" && qData.study_elapsed_ms != null) {
        setElapsedMs(qData.study_elapsed_ms)
      }
    },
    [userId, notebookId, resetting, lastStats.wrong]
  )

  function openEditForQuestion(questionId: string) {
    setEditQuestionId(questionId)
    setShowEditModal(true)
  }

  function openEditForCurrent() {
    fetch(`/api/notebooks/${notebookId}/queue?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => {
        const qid = d.current?.question_id ?? d.question?.id
        if (qid) openEditForQuestion(qid)
      })
  }

  if (!userId) return <p className="p-6">Carregando...</p>

  const unsaved = notebook && notebook.library_saved === false

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link
        href="/questoes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      {unsaved && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            Este caderno ainda não está na sua biblioteca. Salve para encontrá-lo em Questões
            → matéria.
          </p>
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-800 px-3 py-1.5 text-sm text-white hover:bg-amber-900"
          >
            <Bookmark className="h-4 w-4" /> Salvar na biblioteca
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{notebook?.name ?? "Caderno"}</h1>
            {timerReady && (
              <StudyTimer
                key={timerKey}
                initialMs={elapsedMs}
                onPersist={persistElapsed}
                paused={timerPaused}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {unsaved && (
              <button
                type="button"
                onClick={() => setShowSaveModal(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                <Bookmark className="h-4 w-4" /> Salvar
              </button>
            )}
            {lastStats.wrong > 0 && (
              <button
                type="button"
                onClick={() => resetNotebook("wrong")}
                disabled={resetting}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" /> Zerar erradas ({lastStats.wrong})
              </button>
            )}
            {(lastStats.correct + lastStats.wrong > 0 || elapsedMs > 0) && (
              <button
                type="button"
                onClick={() => resetNotebook("all")}
                disabled={resetting}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" /> Zerar tudo
              </button>
            )}
            <button
              type="button"
              onClick={openEditForCurrent}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <Pencil className="h-4 w-4" /> Editar questão
            </button>
            <button
              type="button"
              onClick={deleteNotebook}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Excluir caderno
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <QuestionSolver
          userId={userId}
          mode="notebook"
          notebookId={notebookId}
          fetchQueue={fetchQueueSimple}
          submitAnswer={submitAnswer}
          mapping={mapping}
          onCreateWrongNotebook={createWrongNotebook}
          creatingWrongNotebook={creatingWrong}
          onResetNotebook={resetNotebook}
          resettingNotebook={resetting}
          completedNotebookName={notebook?.name}
          onEditQuestion={openEditForQuestion}
          refreshKey={refreshKey}
          onNotebookComplete={handleNotebookComplete}
        />
      </div>

      {userId && notebook && (
        <SaveNotebookModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          userId={userId}
          notebookId={notebookId}
          initialName={notebook.name}
          initialSubjectId={notebook.subject_id}
          onSaved={reloadNotebook}
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
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
