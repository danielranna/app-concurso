"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { BarChart2, ExternalLink, Flag } from "lucide-react"
import AddErrorModal from "@/components/AddErrorModal"
import QuickNote from "@/components/questions/QuickNote"
import PerformanceModal from "@/components/questions/PerformanceModal"
import QuestionOptions from "@/components/questions/QuestionOptions"
import ConfidenceToggles from "@/components/questions/ConfidenceToggles"
import StudyNavBar from "@/components/questions/StudyNavBar"
import { QuestionTimerDisplay } from "@/components/questions/StudyTimer"
import type { NavMode } from "@/lib/study-navigation"
import type { ConfidenceLevel } from "@/lib/question-types"
import {
  draftScopeKey,
  getDraft,
  listResolvableDrafts,
  setDraft,
  type QuestionDraft,
} from "@/lib/question-draft-cache"

type Question = {
  id: string
  tec_id: number
  tec_url: string
  type: string
  banca: string | null
  cargo: string | null
  orgao: string | null
  ano: number | null
  tec_subject: string | null
  tec_topic: string | null
  statement: string
  correct_answer: string
}

type Option = { label: string; text: string }

type NavOpts = { nav?: NavMode }

type Props = {
  userId: string
  mode: "notebook" | "study"
  notebookId?: string
  studySessionId?: string
  fetchQueue: (opts?: NavOpts) => Promise<{
    current: { question_id: string; tec_id: number; notebook_id: string } | null
    question: Question | null
    options: Option[]
    stats: { total: number; resolved: number; correct: number; wrong: number; pending: number }
    position?: number
  }>
  submitAnswer: (payload: {
    question_id: string
    selected_answer: string
    duration_ms: number
    tec_id: number
    notebook_id?: string
    confidence_level: ConfidenceLevel
  }) => Promise<{
    is_correct: boolean
    correct_answer: string
    tec_url: string
    outcome_category?: string
  }>
  mapping?: { subject_id: string; topic_id: string } | null
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
}

const OUTCOME_LABELS: Record<string, string> = {
  conhecimento_solido: "Conhecimento sólido",
  conhecimento_fragil: "Conhecimento frágil",
  lacuna_critica: "Lacuna crítica",
  lacuna_consciente: "Lacuna consciente",
  falso_positivo: "Falso positivo",
  conteudo_desconhecido: "Conteúdo desconhecido",
}

export default function QuestionSolver({
  userId,
  mode,
  notebookId,
  studySessionId,
  fetchQueue,
  submitAnswer,
  mapping,
}: Props) {
  const scopeId = mode === "notebook" ? notebookId! : studySessionId!
  const scopeKey = draftScopeKey(mode, scopeId)

  const [question, setQuestion] = useState<Question | null>(null)
  const [options, setOptions] = useState<Option[]>([])
  const [stats, setStats] = useState({ total: 0, resolved: 0, correct: 0, wrong: 0, pending: 0 })
  const [position, setPosition] = useState(0)
  const [current, setCurrent] = useState<{
    question_id: string
    tec_id: number
    notebook_id: string
  } | null>(null)

  const [selected, setSelected] = useState<string | null>(null)
  const [eliminated, setEliminated] = useState<Set<string>>(new Set())
  const [confidence, setConfidence] = useState<ConfidenceLevel>("seguro")
  const [questionMs, setQuestionMs] = useState(0)
  const [result, setResult] = useState<{
    is_correct: boolean
    correct_answer: string
    tec_url: string
    outcome_category?: string
  } | null>(null)

  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(false)
  const [batchResolving, setBatchResolving] = useState(false)
  const [showPerf, setShowPerf] = useState(false)
  const [showError, setShowError] = useState(false)
  const [timerTick, setTimerTick] = useState(0)

  const questionStartedAt = useRef(Date.now())
  const currentQuestionId = useRef<string | null>(null)
  const navigateRef = useRef<(nav: NavMode) => void>(() => {})
  const resolveRef = useRef<() => void>(() => {})

  const flushQuestionTime = useCallback(
    (questionId: string) => {
      if (!questionId || questionId !== currentQuestionId.current) return
      const delta = Date.now() - questionStartedAt.current
      const draft = getDraft(scopeKey, questionId)
      setDraft(scopeKey, questionId, {
        ...draft,
        durationMsAccumulated: draft.durationMsAccumulated + delta,
      })
    },
    [scopeKey]
  )

  const applyDraft = useCallback((questionId: string, draft: QuestionDraft) => {
    setSelected(draft.selectedAnswer)
    setEliminated(new Set(draft.eliminated))
    setConfidence(draft.confidence)
    setQuestionMs(draft.durationMsAccumulated)
    if (draft.resolved && draft.result) {
      setResult({
        is_correct: draft.result.is_correct,
        correct_answer: draft.result.correct_answer,
        tec_url: draft.result.tec_url ?? "",
        outcome_category: draft.result.outcome_category,
      })
    } else {
      setResult(null)
    }
  }, [])

  const saveCurrentDraft = useCallback(() => {
    if (!currentQuestionId.current) return
    flushQuestionTime(currentQuestionId.current)
    const draft = getDraft(scopeKey, currentQuestionId.current)
    setDraft(scopeKey, currentQuestionId.current, {
      ...draft,
      selectedAnswer: selected,
      eliminated: [...eliminated],
      confidence,
      durationMsAccumulated:
        getDraft(scopeKey, currentQuestionId.current).durationMsAccumulated,
      resolved: draft.resolved,
      result: draft.result,
    })
  }, [scopeKey, selected, eliminated, confidence, flushQuestionTime])

  const load = useCallback(
    async (opts?: NavOpts) => {
      if (currentQuestionId.current) {
        saveCurrentDraft()
      }

      setLoading(true)
      const data = await fetchQueue(opts)
      setCurrent(data.current)
      setQuestion(data.question)
      let optsList = (data.options ?? []).map((o: { label: string; text: string }) => ({
        label: o.label,
        text: o.text,
      }))
      if (data.question?.type === "certo_errado" && optsList.length === 0) {
        optsList = [
          { label: "Certo", text: "Certo" },
          { label: "Errado", text: "Errado" },
        ]
      }
      setOptions(optsList)
      setStats(data.stats)
      setPosition(data.position ?? 1)

      const qid = data.current?.question_id
      if (qid && data.current) {
        currentQuestionId.current = qid
        const draft = getDraft(scopeKey, qid)
        setDraft(scopeKey, qid, {
          ...draft,
          tec_id: data.current.tec_id,
          notebook_id: data.current.notebook_id,
        })
        applyDraft(qid, getDraft(scopeKey, qid))
        questionStartedAt.current = Date.now()
      } else {
        currentQuestionId.current = null
        setSelected(null)
        setEliminated(new Set())
        setConfidence("seguro")
        setQuestionMs(0)
        setResult(null)
      }
      setLoading(false)
    },
    [fetchQueue, scopeKey, applyDraft, saveCurrentDraft]
  )

  const navigate = useCallback(
    (nav: NavMode) => {
      load({ nav })
    },
    [load]
  )

  navigateRef.current = navigate

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  useEffect(() => {
    if (result) return
    const id = window.setInterval(() => setTimerTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [result])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
      if (e.key === "ArrowRight") {
        e.preventDefault()
        navigateRef.current("next")
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        navigateRef.current("prev")
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault()
        navigateRef.current("random")
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault()
        navigateRef.current("unsolved")
      } else if (e.key === "Enter" && selected && !result) {
        e.preventDefault()
        resolveRef.current()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selected, result])

  const persistDraftState = useCallback(
    (patch: Partial<QuestionDraft>) => {
      if (!currentQuestionId.current) return
      const draft = getDraft(scopeKey, currentQuestionId.current)
      setDraft(scopeKey, currentQuestionId.current, { ...draft, ...patch })
    },
    [scopeKey]
  )

  function handleSelect(label: string) {
    if (result || eliminated.has(label)) return
    setSelected(label)
    persistDraftState({ selectedAnswer: label })
  }

  function handleToggleEliminated(label: string) {
    if (result) return
    const next = new Set(eliminated)
    if (next.has(label)) next.delete(label)
    else next.add(label)
    const newSelected = next.has(label) && selected === label ? null : selected
    setEliminated(next)
    setSelected(newSelected)
    persistDraftState({ eliminated: [...next], selectedAnswer: newSelected })
  }

  function handleConfidenceChange(value: ConfidenceLevel) {
    if (result) return
    setConfidence(value)
    persistDraftState({ confidence: value })
  }

  const handleResolve = useCallback(async () => {
    if (!question || !current || !selected || result || resolving) return
    setResolving(true)
    flushQuestionTime(current.question_id)
    const draft = getDraft(scopeKey, current.question_id)
    const duration_ms = draft.durationMsAccumulated

    try {
      const res = await submitAnswer({
        question_id: question.id,
        selected_answer: selected,
        duration_ms,
        tec_id: current.tec_id,
        notebook_id: current.notebook_id,
        confidence_level: confidence,
      })
      setResult(res)
      setDraft(scopeKey, current.question_id, {
        ...draft,
        selectedAnswer: selected,
        eliminated: [...eliminated],
        confidence,
        durationMsAccumulated: duration_ms,
        resolved: true,
        result: {
          is_correct: res.is_correct,
          correct_answer: res.correct_answer,
          tec_url: res.tec_url,
          outcome_category: res.outcome_category,
        },
      })
      setStats((s) => ({
        ...s,
        resolved: s.resolved + 1,
        correct: s.correct + (res.is_correct ? 1 : 0),
        wrong: s.wrong + (res.is_correct ? 0 : 1),
        pending: Math.max(0, s.pending - 1),
      }))
    } finally {
      setResolving(false)
    }
  }, [
    question,
    current,
    selected,
    result,
    resolving,
    scopeKey,
    eliminated,
    confidence,
    flushQuestionTime,
    submitAnswer,
  ])

  resolveRef.current = handleResolve

  async function handleResolveAll() {
    const pending = listResolvableDrafts(scopeKey)
    if (pending.length < 2 || !question || !current) return
    saveCurrentDraft()
    setBatchResolving(true)
    for (const { questionId, draft } of pending) {
      if (!draft.selectedAnswer || draft.tec_id == null) continue
      const qid = questionId
      if (qid === current.question_id) {
        await handleResolve()
        continue
      }
      const res = await submitAnswer({
        question_id: qid,
        selected_answer: draft.selectedAnswer,
        duration_ms: draft.durationMsAccumulated,
        tec_id: draft.tec_id,
        notebook_id: draft.notebook_id ?? current.notebook_id,
        confidence_level: draft.confidence,
      })
      setDraft(scopeKey, qid, {
        ...draft,
        resolved: true,
        result: {
          is_correct: res.is_correct,
          correct_answer: res.correct_answer,
          tec_url: res.tec_url,
          outcome_category: res.outcome_category,
        },
      })
    }
    setBatchResolving(false)
    navigate("unsolved")
  }

  const resolvableCount = listResolvableDrafts(scopeKey).length
  const locked = !!result

  if (loading) {
    return <p className="p-8 text-slate-500">Carregando questão...</p>
  }

  if (!question || !current) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
        <p className="text-lg font-medium text-green-800">Caderno / sessão concluído!</p>
        {mode === "notebook" && notebookId && (
          <Link href="/questoes/importados" className="mt-4 inline-block text-blue-600">
            Voltar aos cadernos
          </Link>
        )}
        {mode === "study" && studySessionId && (
          <Link href="/questoes/semana" className="mt-4 inline-block text-blue-600">
            Voltar
          </Link>
        )}
      </div>
    )
  }

  const displayIdx = position > 0 ? position : stats.resolved + 1
  const meta = [question.banca, question.cargo, question.orgao, question.ano]
    .filter(Boolean)
    .join(" - ")

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-600">
          Questão {displayIdx} de {stats.total} ({stats.resolved} resolvidas, {stats.correct}{" "}
          acertos e {stats.wrong} erros)
        </p>
        {timerTick >= 0 && (
          <QuestionTimerDisplay
            ms={questionMs + (locked ? 0 : Date.now() - questionStartedAt.current)}
          />
        )}
      </div>

      <p className="mt-3 text-sm">
        <span className="text-slate-500">Matéria:</span> {question.tec_subject}
        {" · "}
        <span className="text-slate-500">Assunto:</span> {question.tec_topic}
      </p>
      <p className="mt-2 rounded bg-slate-100 px-3 py-1 text-xs text-slate-600">
        <a
          href={question.tec_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          #{question.tec_id}
        </a>
        {" · "}
        {meta}
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setShowPerf(true)}
          className="flex items-center gap-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          <BarChart2 className="h-4 w-4" /> Desempenho
        </button>
        <button
          type="button"
          onClick={() => setShowError(true)}
          className="flex items-center gap-1 rounded border px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          <Flag className="h-4 w-4" /> Adicionar erro
        </button>
      </div>

      <div className="mt-6 whitespace-pre-wrap text-slate-800">{question.statement}</div>

      <div className="mt-6">
        <QuestionOptions
          options={options}
          selected={selected}
          eliminated={eliminated}
          locked={locked}
          result={result}
          onSelect={handleSelect}
          onToggleEliminated={handleToggleEliminated}
        />
      </div>

      <div className="mt-5">
        <ConfidenceToggles
          value={confidence}
          disabled={locked}
          onChange={handleConfidenceChange}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleResolve}
          disabled={!selected || locked || resolving}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {resolving ? "Resolvendo..." : "Resolver questão"}
        </button>
        {resolvableCount >= 2 && !locked && (
          <button
            type="button"
            onClick={handleResolveAll}
            disabled={batchResolving}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {batchResolving
              ? "Resolvendo..."
              : `Marcar ${resolvableCount} como resolvidas`}
          </button>
        )}
      </div>

      {result && (
        <div
          className={`mt-4 rounded-lg p-4 ${result.is_correct ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          {result.is_correct ? "Você acertou!" : `Você errou! Gabarito: ${result.correct_answer}.`}
          {result.outcome_category && (
            <p className="mt-1 text-sm opacity-90">
              {OUTCOME_LABELS[result.outcome_category] ?? result.outcome_category}
            </p>
          )}
          <a
            href={result.tec_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-blue-600 underline"
          >
            Ver no TEC <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      <div className="mt-6">
        <StudyNavBar onNavigate={navigate} />
      </div>

      <div className="mt-4">
        <QuickNote questionId={question.id} userId={userId} />
      </div>

      {showPerf && (
        <PerformanceModal
          questionId={question.id}
          userId={userId}
          onClose={() => setShowPerf(false)}
        />
      )}
      <AddErrorModal
        isOpen={showError}
        onClose={() => setShowError(false)}
        initialData={
          mapping
            ? {
                id: "",
                topic_id: mapping.topic_id,
                subject_id: mapping.subject_id,
                error_text: "",
                correction_text: "",
                description: question.statement.slice(0, 500),
                reference_link: question.tec_url,
              }
            : undefined
        }
      />
    </div>
  )
}
