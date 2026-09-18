"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { BarChart2, ExternalLink, Flag, RotateCcw, Trash2 } from "lucide-react"
import AddErrorModal from "@/components/AddErrorModal"
import QuickNote, { type QuickNoteHandle } from "@/components/questions/QuickNote"
import PerformanceModal from "@/components/questions/PerformanceModal"
import QuestionOptions from "@/components/questions/QuestionOptions"
import ConfidenceToggles from "@/components/questions/ConfidenceToggles"
import WhatsAppStudyPanel from "@/components/questions/WhatsAppStudyPanel"
import StudyNavBar from "@/components/questions/StudyNavBar"
import { QuestionTimerDisplay } from "@/components/questions/StudyTimer"
import QuestionContentDisplay from "@/components/questions/QuestionContentDisplay"
import {
  resolveQuestionContentBlocks,
  type QuestionContentBlocks,
} from "@/lib/question-content-blocks"
import type { ResolvedSharedBlock } from "@/lib/shared-assets"
import { pickTargetQuestionId, type NavMode } from "@/lib/study-navigation"
import type { ConfidenceLevel, StudySessionNotebookBreakdown } from "@/lib/question-types"
import CombinedSessionNotebookSummary from "@/components/questions/CombinedSessionNotebookSummary"
import NotebookCompleteSummary from "@/components/questions/NotebookCompleteSummary"
import {
  draftScopeKey,
  getDraft,
  listResolvableDrafts,
  removeDraft,
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
  content_before?: string | null
  content_after?: string | null
  content_blocks?: QuestionContentBlocks | null
  shared_blocks?: ResolvedSharedBlock[] | null
}

type Option = { label: string; text: string }

type SubmitAnswerResult =
  | {
      is_correct: boolean
      correct_answer: string
      tec_url: string
      outcome_category?: string
    }
  | { error: string; is_correct: null }

type NavOpts = { nav?: NavMode; question_id?: string; peek?: boolean }

type QueueResult = {
  current: {
    question_id: string
    tec_id: number
    notebook_id: string
    short_id?: string
    caderno_id?: number | null
  } | null
  question: Question | null
  options: Option[]
  stats: { total: number; resolved: number; correct: number; wrong: number; pending: number }
  position?: number
  attempt?: {
    selected_answer: string
    is_correct: boolean
    confidence_level?: string | null
    outcome_category?: string | null
    duration_ms?: number | null
  } | null
  study_elapsed_ms?: number
  report_id?: string | null
  report_pending?: boolean
  queue_ids?: string[]
  answered_ids?: string[]
}

type Props = {
  userId: string
  mode: "notebook" | "study" | "solo"
  notebookId?: string
  studySessionId?: string
  /** Obrigatório quando mode === "solo" */
  soloQuestionId?: string
  returnHref?: string
  fetchQueue: (opts?: NavOpts) => Promise<QueueResult>
  submitAnswer: (payload: {
    question_id: string
    selected_answer: string
    duration_ms: number
    tec_id: number
    notebook_id?: string
    confidence_level: ConfidenceLevel
    tags?: string[]
    note_draft?: string | null
    short_id?: string | null
    caderno_id?: number | null
  }) => Promise<SubmitAnswerResult>
  mapping?: { subject_id: string; topic_id: string } | null
  onCreateWrongNotebook?: () => Promise<void>
  creatingWrongNotebook?: boolean
  onResetNotebook?: (mode: "all" | "wrong") => Promise<void>
  resettingNotebook?: boolean
  completedNotebookName?: string
  onEditQuestion?: (questionId: string) => void
  /** Chamado após remover a questão do caderno (e opcionalmente do banco). */
  onQuestionRemoved?: () => void
  refreshKey?: number
  onNotebookComplete?: () => void
  /** Pausa o timer da questão (ex.: quando o cronômetro do caderno está pausado). */
  timerPaused?: boolean
  /** Tempo acumulado do caderno (conclusão). */
  elapsedMs?: number
  /** Chamado ao zerar o tempo da questão atual (caderno já persistido). */
  onQuestionTimeReset?: (studyElapsedMs: number) => void
  whatsappOverlay?: {
    enabled?: boolean
    shortId?: string | null
    notebookId?: string
  }
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
}

function matchSavedAnswer(
  saved: string,
  options: Option[],
  questionType?: string
): string {
  const raw = saved.trim()
  const byLabel = options.find((o) => o.label === raw || o.text === raw)
  if (byLabel) return byLabel.label
  const lower = raw.toLowerCase()
  if (questionType === "certo_errado" || lower === "c" || lower === "e" || lower === "certo" || lower === "errado") {
    if (lower === "c" || lower.startsWith("certo")) {
      const hit = options.find((o) => /^certo$/i.test(o.label) || /^certo$/i.test(o.text))
      if (hit) return hit.label
    }
    if (lower === "e" || lower.startsWith("errado")) {
      const hit = options.find((o) => /^errado$/i.test(o.label) || /^errado$/i.test(o.text))
      if (hit) return hit.label
    }
  }
  const byLetter = options.find((o) => o.label.toUpperCase() === raw.toUpperCase())
  return byLetter?.label ?? raw
}

function answersMatch(
  questionType: string | undefined,
  selected: string,
  correct: string
): boolean {
  const s = selected.trim()
  const c = correct.trim()
  if (/^anulada$/i.test(c)) return false
  if (questionType === "certo_errado") {
    return s.toLowerCase() === c.toLowerCase()
  }
  return s.toUpperCase() === c.toUpperCase()
}

function outcomeFromConfidence(
  confidence: ConfidenceLevel,
  isCorrect: boolean
): string {
  if (confidence === "chute") {
    return isCorrect ? "falso_positivo" : "conteudo_desconhecido"
  }
  if (confidence === "inseguro") {
    return isCorrect ? "conhecimento_fragil" : "lacuna_consciente"
  }
  return isCorrect ? "conhecimento_solido" : "lacuna_critica"
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
  onCreateWrongNotebook,
  creatingWrongNotebook,
  onResetNotebook,
  resettingNotebook,
  completedNotebookName,
  onEditQuestion,
  onQuestionRemoved,
  refreshKey,
  onNotebookComplete,
  timerPaused = false,
  elapsedMs: elapsedMsProp,
  onQuestionTimeReset,
  soloQuestionId,
  returnHref,
  whatsappOverlay,
}: Props) {
  const scopeId =
    mode === "notebook"
      ? notebookId!
      : mode === "study"
        ? studySessionId!
        : soloQuestionId!
  const scopeKey = draftScopeKey(mode, scopeId)

  const [question, setQuestion] = useState<Question | null>(null)
  const [options, setOptions] = useState<Option[]>([])
  const [stats, setStats] = useState({ total: 0, resolved: 0, correct: 0, wrong: 0, pending: 0 })
  const [position, setPosition] = useState(0)
  const [current, setCurrent] = useState<{
    question_id: string
    tec_id: number
    notebook_id: string
    short_id?: string
    caderno_id?: number | null
  } | null>(null)

  const [selected, setSelected] = useState<string | null>(null)
  const [eliminated, setEliminated] = useState<Set<string>>(new Set())
  const [confidence, setConfidence] = useState<ConfidenceLevel>("seguro")
  const [waTags, setWaTags] = useState<string[]>([])
  const [notesEpoch, setNotesEpoch] = useState(0)
  const [questionMs, setQuestionMs] = useState(0)
  const [result, setResult] = useState<{
    is_correct: boolean
    correct_answer: string
    tec_url: string
    outcome_category?: string
  } | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showNotebookSummary, setShowNotebookSummary] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)
  const [reportPending, setReportPending] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(elapsedMsProp ?? 0)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [batchResolving, setBatchResolving] = useState(false)
  const [showPerf, setShowPerf] = useState(false)
  const [showError, setShowError] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [timerTick, setTimerTick] = useState(0)
  const [notebookBreakdown, setNotebookBreakdown] = useState<
    StudySessionNotebookBreakdown[] | null
  >(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [resettingQuestionTime, setResettingQuestionTime] = useState(false)

  const questionStartedAt = useRef(Date.now())
  const timerWasPaused = useRef(false)
  const currentQuestionId = useRef<string | null>(null)
  const navigateRef = useRef<(nav: NavMode) => void>(() => {})
  const resolveRef = useRef<() => void>(() => {})
  const quickNoteRef = useRef<QuickNoteHandle>(null)
  const loadGen = useRef(0)
  const questionCache = useRef(new Map<string, QueueResult>())
  const queueIdsRef = useRef<string[]>([])
  const answeredIdsRef = useRef(new Set<string>())
  const prefetchingRef = useRef(new Set<string>())
  const resolvingIds = useRef(new Set<string>())
  const questionRef = useRef<Question | null>(null)
  const currentRef = useRef<typeof current>(null)
  const uiStateRef = useRef<{
    questionId: string | null
    selected: string | null
    eliminated: string[]
    confidence: ConfidenceLevel
  }>({
    questionId: null,
    selected: null,
    eliminated: [],
    confidence: "seguro",
  })

  const flushQuestionTime = useCallback(
    (questionId: string) => {
      if (!questionId || questionId !== currentQuestionId.current) return
      const draft = getDraft(scopeKey, questionId)
      if (draft.resolved) return
      const delta = Date.now() - questionStartedAt.current
      questionStartedAt.current = Date.now()
      setDraft(scopeKey, questionId, {
        ...draft,
        durationMsAccumulated: draft.durationMsAccumulated + delta,
      })
    },
    [scopeKey]
  )

  const applyDraft = useCallback((questionId: string, draft: QuestionDraft) => {
    uiStateRef.current = {
      questionId,
      selected: draft.selectedAnswer,
      eliminated: draft.eliminated,
      confidence: draft.confidence,
    }
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
    const ui =
      uiStateRef.current.questionId === currentQuestionId.current
        ? uiStateRef.current
        : null
    setDraft(scopeKey, currentQuestionId.current, {
      ...draft,
      selectedAnswer: ui ? ui.selected : draft.selectedAnswer,
      eliminated: ui ? ui.eliminated : draft.eliminated,
      confidence: ui ? ui.confidence : draft.confidence,
      durationMsAccumulated:
        getDraft(scopeKey, currentQuestionId.current).durationMsAccumulated,
      resolved: draft.resolved,
      result: draft.result,
    })
  }, [scopeKey, flushQuestionTime])

  const showQueueResult = useCallback(
    (
      data: QueueResult,
      opts?: { nav?: NavMode; fromCache?: boolean; resetTimer?: boolean }
    ) => {
      if (data.queue_ids?.length) {
        queueIdsRef.current = data.queue_ids
      }
      if (data.answered_ids) {
        for (const id of data.answered_ids) answeredIdsRef.current.add(id)
      }

      const statsNext = data.stats ?? {
        total: 0,
        resolved: 0,
        correct: 0,
        wrong: 0,
        pending: 0,
      }
      if (!opts?.fromCache) {
        setStats((prev) =>
          statsNext.resolved >= prev.resolved ? statsNext : prev
        )
      }
      setCurrent(data.current)
      setQuestion(data.question)
      currentRef.current = data.current
      questionRef.current = data.question
      setOptions(
        (data.options ?? []).map((o: { label: string; text: string }) => ({
          label: o.label,
          text: o.text,
        }))
      )
      const qid = data.current?.question_id
      const fromQueue =
        qid && queueIdsRef.current.length
          ? queueIdsRef.current.indexOf(qid) + 1
          : 0
      setPosition(fromQueue > 0 ? fromQueue : data.position ?? 1)
      if (!opts?.fromCache && typeof data.study_elapsed_ms === "number") {
        setElapsedMs(data.study_elapsed_ms)
      }
      if (data.report_id) setReportId(data.report_id)
      if (!opts?.fromCache) {
        setReportPending(Boolean(data.report_pending) && !data.report_id)
      }
      const pendingForDone = opts?.fromCache ? undefined : statsNext.pending
      const notebookDone =
        mode === "notebook" &&
        pendingForDone === 0 &&
        statsNext.total > 0
      if (notebookDone && (!opts?.nav || opts.nav === "unsolved")) {
        setShowNotebookSummary(true)
      } else if (opts?.nav) {
        setShowNotebookSummary(false)
      }

      if (qid && data.current) {
        currentQuestionId.current = qid
        const draft = getDraft(scopeKey, qid)
        setDraft(scopeKey, qid, {
          ...draft,
          tec_id: data.current.tec_id,
          notebook_id: data.current.notebook_id,
          short_id: data.current.short_id,
          caderno_id: data.current.caderno_id ?? null,
        })
        let nextDraft = getDraft(scopeKey, qid)
        const attempt = data.attempt
        if (
          attempt?.selected_answer &&
          data.question &&
          !nextDraft.resolved
        ) {
          const conf = attempt.confidence_level
          const confidence: ConfidenceLevel =
            conf === "inseguro" || conf === "chute" ? conf : "seguro"
          const optsList = (data.options ?? []).map(
            (o: { label: string; text: string }) => ({
              label: o.label,
              text: o.text,
            })
          )
          const selectedAnswer = matchSavedAnswer(
            attempt.selected_answer,
            optsList,
            data.question.type
          )
          const storedMs = Math.max(0, Number(attempt.duration_ms) || 0)
          nextDraft = {
            ...nextDraft,
            selectedAnswer,
            confidence,
            durationMsAccumulated: Math.max(
              nextDraft.durationMsAccumulated || 0,
              storedMs
            ),
            resolved: true,
            result: {
              is_correct: attempt.is_correct,
              correct_answer: data.question.correct_answer,
              tec_url: data.question.tec_url ?? "",
              outcome_category: attempt.outcome_category ?? undefined,
            },
          }
          setDraft(scopeKey, qid, nextDraft)
        }
        if (nextDraft.resolved) answeredIdsRef.current.add(qid)
        applyDraft(qid, nextDraft)
        if (opts?.resetTimer !== false) {
          questionStartedAt.current = Date.now()
        }
        setWaTags([])
        questionCache.current.set(qid, data)
      } else {
        currentQuestionId.current = null
        currentRef.current = null
        questionRef.current = null
        setSelected(null)
        setEliminated(new Set())
        setConfidence("seguro")
        setQuestionMs(0)
        setResult(null)
        if (mode === "notebook" && statsNext.pending === 0 && statsNext.total > 0) {
          onNotebookComplete?.()
        }
      }
    },
    [scopeKey, applyDraft, mode, onNotebookComplete]
  )

  const prefetchNeighbors = useCallback(
    (questionId: string) => {
      const ids = queueIdsRef.current
      const idx = ids.indexOf(questionId)
      if (idx < 0) return
      const targets = [ids[idx - 1], ids[idx + 1], ids[idx + 2]].filter(
        (id): id is string => Boolean(id) && id !== questionId
      )
      for (const id of targets) {
        if (questionCache.current.has(id) || prefetchingRef.current.has(id)) {
          continue
        }
        prefetchingRef.current.add(id)
        void fetchQueue({ question_id: id, peek: true })
          .then((data) => {
            if (data.current?.question_id && data.question) {
              questionCache.current.set(data.current.question_id, data)
            }
            if (data.queue_ids?.length) queueIdsRef.current = data.queue_ids
            if (data.answered_ids) {
              for (const answeredId of data.answered_ids) {
                answeredIdsRef.current.add(answeredId)
              }
            }
          })
          .catch(() => {})
          .finally(() => {
            prefetchingRef.current.delete(id)
          })
      }
    },
    [fetchQueue]
  )

  const load = useCallback(
    async (opts?: NavOpts) => {
      if (currentQuestionId.current) {
        saveCurrentDraft()
      }

      const requestId = ++loadGen.current
      if (!currentQuestionId.current) setLoading(true)
      setLoadError(null)
      try {
        const data = await fetchQueue(
          opts?.question_id
            ? { question_id: opts.question_id, peek: opts?.peek }
            : { nav: opts?.nav, peek: opts?.peek }
        )
        if (requestId !== loadGen.current) return
        showQueueResult(data, { nav: opts?.nav })
        const qid = data.current?.question_id
        if (qid) prefetchNeighbors(qid)
      } catch (e) {
        if (requestId !== loadGen.current) return
        setLoadError(e instanceof Error ? e.message : "Erro ao carregar a questão")
      } finally {
        if (requestId === loadGen.current) setLoading(false)
      }
    },
    [fetchQueue, saveCurrentDraft, showQueueResult, prefetchNeighbors]
  )

  const persistActiveQuestion = useCallback(
    (questionId: string, requestId: number) => {
      void fetchQueue({ question_id: questionId })
        .then((data) => {
          if (requestId !== loadGen.current) return
          if (data.queue_ids?.length) queueIdsRef.current = data.queue_ids
          if (data.answered_ids) {
            for (const id of data.answered_ids) answeredIdsRef.current.add(id)
          }
          if (data.stats) {
            const incoming = data.stats
            setStats((prev) =>
              incoming.resolved >= prev.resolved ? incoming : prev
            )
          }
          if (typeof data.study_elapsed_ms === "number") {
            setElapsedMs(data.study_elapsed_ms)
          }
          if (data.report_id) setReportId(data.report_id)
          if (data.current?.question_id === questionId && data.question) {
            questionCache.current.set(questionId, data)
          }
        })
        .catch(() => {})
    },
    [fetchQueue]
  )

  const navigate = useCallback(
    (nav: NavMode) => {
      if (currentQuestionId.current) saveCurrentDraft()

      const currentId = currentQuestionId.current
      const targetId = pickTargetQuestionId(
        queueIdsRef.current,
        currentId,
        answeredIdsRef.current,
        nav
      )

      if (targetId && targetId === currentId) {
        return
      }

      if (targetId) {
        const cached = questionCache.current.get(targetId)
        if (cached?.question && cached.current) {
          const requestId = ++loadGen.current
          showQueueResult(cached, { nav, fromCache: true })
          prefetchNeighbors(targetId)
          persistActiveQuestion(targetId, requestId)
          return
        }
        void load({ question_id: targetId, nav })
        return
      }

      void load({ nav })
    },
    [
      saveCurrentDraft,
      showQueueResult,
      prefetchNeighbors,
      persistActiveQuestion,
      load,
    ]
  )

  navigateRef.current = navigate
  questionRef.current = question
  currentRef.current = current

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  useEffect(() => {
    if (refreshKey != null && refreshKey > 0) {
      questionCache.current.clear()
      answeredIdsRef.current.clear()
      queueIdsRef.current = []
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  useEffect(() => {
    setConfirmDelete(false)
    setDeleteError(null)
    setResolveError(null)
  }, [question?.id])

  const removeCurrentQuestion = useCallback(
    async (removeMode: "notebook" | "bank") => {
      if (mode !== "notebook" || !notebookId || !question || deleting) return
      const qid = question.id
      setDeleting(true)
      setDeleteError(null)
      try {
        const res = await fetch(
          `/api/notebooks/${notebookId}/questions/${qid}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, mode: removeMode }),
          }
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setDeleteError(data.error ?? "Erro ao excluir")
          return
        }
        removeDraft(scopeKey, qid)
        questionCache.current.delete(qid)
        answeredIdsRef.current.delete(qid)
        queueIdsRef.current = queueIdsRef.current.filter((id) => id !== qid)
        currentQuestionId.current = null
        setConfirmDelete(false)
        onQuestionRemoved?.()
        await load()
      } catch {
        setDeleteError("Erro ao excluir")
      } finally {
        setDeleting(false)
      }
    },
    [
      mode,
      notebookId,
      question,
      deleting,
      userId,
      scopeKey,
      onQuestionRemoved,
      load,
    ]
  )

  const sessionComplete =
    !loading && mode === "study" && studySessionId && (!question || !current)

  useEffect(() => {
    if (!sessionComplete) {
      setNotebookBreakdown(null)
      return
    }
    let cancelled = false
    setLoadingSummary(true)
    fetch(
      `/api/study-sessions/${studySessionId}/summary?user_id=${encodeURIComponent(userId)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setNotebookBreakdown(data.notebook_breakdown ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) setNotebookBreakdown([])
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionComplete, studySessionId, userId])

  useEffect(() => {
    if (timerPaused && !timerWasPaused.current) {
      if (currentQuestionId.current) flushQuestionTime(currentQuestionId.current)
      const draft = currentQuestionId.current
        ? getDraft(scopeKey, currentQuestionId.current)
        : null
      if (draft) setQuestionMs(draft.durationMsAccumulated)
      timerWasPaused.current = true
    } else if (!timerPaused && timerWasPaused.current) {
      questionStartedAt.current = Date.now()
      timerWasPaused.current = false
    }
  }, [timerPaused, flushQuestionTime, scopeKey])

  useEffect(() => {
    if (result || timerPaused) return
    const id = window.setInterval(() => setTimerTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [result, timerPaused])

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
      } else if (e.key === "Enter") {
        e.preventDefault()
        resolveRef.current()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const persistDraftState = useCallback(
    (patch: Partial<QuestionDraft>) => {
      if (!currentQuestionId.current) return
      if (uiStateRef.current.questionId !== currentQuestionId.current) {
        uiStateRef.current = {
          questionId: currentQuestionId.current,
          selected: null,
          eliminated: [],
          confidence: "seguro",
        }
      }
      if (patch.selectedAnswer !== undefined) {
        uiStateRef.current.selected = patch.selectedAnswer
      }
      if (patch.eliminated) {
        uiStateRef.current.eliminated = patch.eliminated
      }
      if (patch.confidence) {
        uiStateRef.current.confidence = patch.confidence
      }
      const draft = getDraft(scopeKey, currentQuestionId.current)
      setDraft(scopeKey, currentQuestionId.current, { ...draft, ...patch })
    },
    [scopeKey]
  )

  function handleSelect(label: string) {
    if (result || eliminated.has(label)) return
    if (
      currentQuestionId.current &&
      getDraft(scopeKey, currentQuestionId.current).resolved
    ) {
      return
    }
    setSelected(label)
    persistDraftState({ selectedAnswer: label })
  }

  function handleToggleEliminated(label: string) {
    if (result) return
    if (
      currentQuestionId.current &&
      getDraft(scopeKey, currentQuestionId.current).resolved
    ) {
      return
    }
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
    const questionNow = questionRef.current
    const currentNow = currentRef.current
    const selectedAnswer = uiStateRef.current.selected
    if (!questionNow || !currentNow || !selectedAnswer) return
    if (currentNow.question_id !== currentQuestionId.current) return
    if (uiStateRef.current.questionId !== currentNow.question_id) return
    if (getDraft(scopeKey, currentNow.question_id).resolved) return
    const questionId = currentNow.question_id
    if (resolvingIds.current.has(questionId)) return

    const eliminatedNow = uiStateRef.current.eliminated
    const confidenceNow = uiStateRef.current.confidence
    const tagsNow = waTags
    const noteDraft = quickNoteRef.current?.consumeDraft() || null
    const notebookIdNow = currentNow.notebook_id
    const tecId = currentNow.tec_id
    const shortId = currentNow.short_id ?? null
    const cadernoId = currentNow.caderno_id ?? null
    const tecUrl = questionNow.tec_url ?? ""
    const correctAnswer = questionNow.correct_answer
    const isCorrect = answersMatch(questionNow.type, selectedAnswer, correctAnswer)
    const outcome = outcomeFromConfidence(confidenceNow, isCorrect)

    resolvingIds.current.add(questionId)
    setResolveError(null)
    flushQuestionTime(questionId)
    const draft = getDraft(scopeKey, questionId)
    const duration_ms = draft.durationMsAccumulated
    const localResult = {
      is_correct: isCorrect,
      correct_answer: correctAnswer,
      tec_url: tecUrl,
      outcome_category: outcome,
    }

    answeredIdsRef.current.add(questionId)
    setDraft(scopeKey, questionId, {
      ...draft,
      selectedAnswer,
      eliminated: eliminatedNow,
      confidence: confidenceNow,
      durationMsAccumulated: duration_ms,
      resolved: true,
      result: localResult,
    })
    const cached = questionCache.current.get(questionId)
    if (cached) {
      questionCache.current.set(questionId, {
        ...cached,
        attempt: {
          selected_answer: selectedAnswer,
          is_correct: isCorrect,
          confidence_level: confidenceNow,
          outcome_category: outcome,
          duration_ms,
        },
      })
    }

    if (currentQuestionId.current === questionId) {
      setResult(localResult)
      setNotesEpoch((n) => n + 1)
    }

    setStats((s) => {
      const next = {
        ...s,
        resolved: s.resolved + 1,
        correct: s.correct + (isCorrect ? 1 : 0),
        wrong: s.wrong + (isCorrect ? 0 : 1),
        pending: Math.max(0, s.pending - 1),
      }
      if (mode === "notebook" && next.pending === 0 && next.total > 0) {
        onNotebookComplete?.()
        if (currentQuestionId.current === questionId) {
          setShowNotebookSummary(true)
        }
      }
      return next
    })

    try {
      const res = await submitAnswer({
        question_id: questionId,
        selected_answer: selectedAnswer,
        duration_ms,
        tec_id: tecId,
        notebook_id: notebookIdNow,
        confidence_level: confidenceNow,
        tags: tagsNow,
        note_draft: noteDraft,
        short_id: shortId,
        caderno_id: cadernoId,
      })
      if ("error" in res) {
        answeredIdsRef.current.delete(questionId)
        const latest = getDraft(scopeKey, questionId)
        setDraft(scopeKey, questionId, {
          ...latest,
          resolved: false,
          result: undefined,
        })
        setStats((s) => ({
          ...s,
          resolved: Math.max(0, s.resolved - 1),
          correct: Math.max(0, s.correct - (isCorrect ? 1 : 0)),
          wrong: Math.max(0, s.wrong - (isCorrect ? 0 : 1)),
          pending: s.pending + 1,
        }))
        if (currentQuestionId.current === questionId) {
          setResult(null)
          setResolveError(res.error)
        }
        return
      }
      const serverResult = {
        is_correct: res.is_correct,
        correct_answer: res.correct_answer,
        tec_url: res.tec_url,
        outcome_category: res.outcome_category,
      }
      const latest = getDraft(scopeKey, questionId)
      setDraft(scopeKey, questionId, {
        ...latest,
        resolved: true,
        result: serverResult,
      })
      const cachedNow = questionCache.current.get(questionId)
      if (cachedNow) {
        questionCache.current.set(questionId, {
          ...cachedNow,
          attempt: {
            selected_answer: selectedAnswer,
            is_correct: res.is_correct,
            confidence_level: confidenceNow,
            outcome_category: res.outcome_category ?? null,
            duration_ms,
          },
        })
      }
      if (currentQuestionId.current === questionId) {
        setResult(serverResult)
      }
    } catch {
      answeredIdsRef.current.delete(questionId)
      const latest = getDraft(scopeKey, questionId)
      setDraft(scopeKey, questionId, {
        ...latest,
        resolved: false,
        result: undefined,
      })
      setStats((s) => ({
        ...s,
        resolved: Math.max(0, s.resolved - 1),
        correct: Math.max(0, s.correct - (isCorrect ? 1 : 0)),
        wrong: Math.max(0, s.wrong - (isCorrect ? 0 : 1)),
        pending: s.pending + 1,
      }))
      if (currentQuestionId.current === questionId) {
        setResult(null)
        setResolveError("Não foi possível salvar. Tente novamente.")
      }
    } finally {
      resolvingIds.current.delete(questionId)
    }
  }, [
    scopeKey,
    flushQuestionTime,
    submitAnswer,
    mode,
    onNotebookComplete,
    waTags,
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
        short_id: draft.short_id ?? current.short_id ?? null,
        caderno_id: draft.caderno_id ?? current.caderno_id ?? null,
      })
      if ("error" in res) continue
      answeredIdsRef.current.add(qid)
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

  async function handleResetQuestionTime() {
    const cut = Math.max(
      0,
      Math.round(questionMs + (locked || timerPaused ? 0 : Date.now() - questionStartedAt.current))
    )
    if (cut <= 0) return
    if (
      !confirm(
        "Zerar o tempo desta questão e descontar esse valor do cronômetro do caderno?"
      )
    ) {
      return
    }
    const qid = current?.question_id || question?.id
    questionStartedAt.current = Date.now()
    setQuestionMs(0)
    if (qid) {
      const draft = getDraft(scopeKey, qid)
      setDraft(scopeKey, qid, { ...draft, durationMsAccumulated: 0 })
    }
    if (mode === "notebook" && notebookId && qid) {
      setResettingQuestionTime(true)
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/question-time`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            question_id: qid,
            subtract_ms: cut,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && typeof data.study_elapsed_ms === "number") {
          onQuestionTimeReset?.(data.study_elapsed_ms)
        }
      } finally {
        setResettingQuestionTime(false)
      }
    }
  }

  if (showNotebookSummary && mode === "notebook" && notebookId) {
    return (
      <NotebookCompleteSummary
        userId={userId}
        notebookId={notebookId}
        notebookName={completedNotebookName}
        stats={stats}
        elapsedMs={elapsedMsProp ?? elapsedMs}
        initialReportId={reportId}
        reportPending={reportPending}
        onReview={() => {
          setShowNotebookSummary(false)
          if (!question || !current) navigate("prev")
        }}
        onCreateWrongNotebook={onCreateWrongNotebook}
        creatingWrongNotebook={creatingWrongNotebook}
        onResetNotebook={onResetNotebook}
        resettingNotebook={resettingNotebook}
      />
    )
  }

  if (loading && !question) {
    return <p className="p-8 text-slate-500">Carregando questão...</p>
  }

  if (loadError && !question) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-8 text-sm text-red-800">
        {loadError}
      </p>
    )
  }

  if (!question || !current) {
    const wrongN = stats.wrong
    return (
      <div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <p className="text-lg font-medium text-green-800">Caderno / sessão concluído!</p>
        {completedNotebookName && (
          <p className="text-sm text-green-700">{completedNotebookName}</p>
        )}
        <p className="text-sm text-green-700">
          {stats.correct} acertos · {stats.wrong} erros de {stats.total} questões
        </p>
        {mode === "study" && loadingSummary && (
          <p className="text-sm text-green-700">Carregando estatísticas por caderno...</p>
        )}
        {mode === "study" && !loadingSummary && notebookBreakdown && (
          <CombinedSessionNotebookSummary breakdown={notebookBreakdown} />
        )}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {wrongN > 0 && (
            <Link
              href="/questoes/revisao"
              className="rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-900 hover:bg-red-50"
            >
              Ver correções de hoje
            </Link>
          )}
          {mode === "notebook" && onResetNotebook && (
            <button
              type="button"
              onClick={() => onResetNotebook("all")}
              disabled={resettingNotebook}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {resettingNotebook ? "Zerando..." : "Refazer caderno (zerar tudo)"}
            </button>
          )}
          {mode === "notebook" && onResetNotebook && wrongN > 0 && (
            <button
              type="button"
              onClick={() => onResetNotebook("wrong")}
              disabled={resettingNotebook}
              className="rounded-lg border border-green-400 bg-white px-5 py-2.5 text-sm font-medium text-green-900 disabled:opacity-50 hover:bg-green-100"
            >
              {resettingNotebook ? "Zerando..." : `Refazer só erradas (${wrongN})`}
            </button>
          )}
          {mode === "notebook" && onCreateWrongNotebook && wrongN > 0 && (
            <button
              type="button"
              onClick={() => onCreateWrongNotebook()}
              disabled={creatingWrongNotebook || resettingNotebook}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm text-slate-800 disabled:opacity-50 hover:bg-slate-50"
            >
              {creatingWrongNotebook
                ? "Criando..."
                : `Criar caderno das erradas (${wrongN})`}
            </button>
          )}
          {mode === "notebook" && notebookId && (
            <Link
              href="/questoes"
              className="rounded-lg border border-green-300 bg-white px-5 py-2.5 text-sm text-green-800 hover:bg-green-100"
            >
              Voltar aos cadernos
            </Link>
          )}
          {mode === "study" && studySessionId && (
            <Link
              href="/questoes/semana"
              className="rounded-lg border border-green-300 bg-white px-5 py-2.5 text-sm text-green-800 hover:bg-green-100"
            >
              Voltar
            </Link>
          )}
        </div>
      </div>
    )
  }

  const displayIdx = position > 0 ? position : stats.resolved + 1
  const meta = [question.banca, question.cargo, question.orgao, question.ano]
    .filter(Boolean)
    .join(" - ")

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">
            {mode === "solo"
              ? "Prática avulsa"
              : `Questão ${displayIdx} de ${stats.total}`}
          </p>
          {timerTick >= 0 && (
            <span className="inline-flex items-center gap-2">
              <QuestionTimerDisplay
                ms={
                  questionMs +
                  (locked || timerPaused ? 0 : Date.now() - questionStartedAt.current)
                }
                paused={locked || timerPaused}
              />
              {questionMs +
                (locked || timerPaused ? 0 : Date.now() - questionStartedAt.current) >
                0 && (
                <button
                  type="button"
                  onClick={() => void handleResetQuestionTime()}
                  disabled={resettingQuestionTime}
                  title="Zerar só esta questão e descontar do caderno"
                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  {resettingQuestionTime ? "…" : "zerar"}
                </button>
              )}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {stats.resolved} resolvidas · {stats.correct} acertos · {stats.wrong} erros
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Informações
        </p>
        <p className="mt-2 text-sm text-slate-700">
          <span className="text-slate-500">Matéria:</span> {question.tec_subject}
          <br />
          <span className="text-slate-500">Assunto:</span> {question.tec_topic}
        </p>
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <a
            href={question.tec_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 hover:underline"
          >
            #{question.tec_id}
          </a>
          {meta ? ` · ${meta}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setShowPerf(true)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            <BarChart2 className="h-4 w-4" /> Desempenho
          </button>
          <button
            type="button"
            onClick={() => setShowError(true)}
            className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            <Flag className="h-4 w-4" /> Adicionar erro
          </button>
          {onEditQuestion && (
            <button
              type="button"
              onClick={() => onEditQuestion(question.id)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              Editar questão
            </button>
          )}
          {mode === "notebook" && notebookId && (
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(true)
                setDeleteError(null)
              }}
              disabled={deleting}
              className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </button>
          )}
        </div>
        {mode === "notebook" && notebookId && confirmDelete && (
          <div className="mt-3 rounded-lg border border-red-100 bg-red-50/60 px-3 py-2.5">
            <p className="text-xs font-medium text-slate-700">
              Remover esta questão do caderno?
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              <strong>Só do caderno</strong> remove daqui e mantém no banco.{" "}
              <strong>Do caderno e do banco</strong> apaga de vez (some de outros
              cadernos que usem a mesma questão).
            </p>
            {deleteError && (
              <p className="mt-2 text-xs text-red-600">{deleteError}</p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => removeCurrentQuestion("notebook")}
                disabled={deleting}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {deleting ? "Excluindo…" : "Só do caderno"}
              </button>
              <button
                type="button"
                onClick={() => removeCurrentQuestion("bank")}
                disabled={deleting}
                className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Do caderno e do banco
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false)
                  setDeleteError(null)
                }}
                disabled={deleting}
                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="order-1 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-start-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Enunciado
          </p>
          <div className="mt-3">
            <QuestionContentDisplay
              studyMode
              sharedBlocks={question.shared_blocks ?? []}
              blocks={resolveQuestionContentBlocks({
                content_blocks: question.content_blocks,
                content_before: question.content_before,
                content_after: question.content_after,
              })}
              statement={question.statement}
            />
          </div>
        </section>

        <aside className="order-2 space-y-4 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <div className="h-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <QuickNote
              ref={quickNoteRef}
              key={`${question.id}-${notesEpoch}`}
              questionId={question.id}
              userId={userId}
              layout="sidebar"
            />
          </div>
          <WhatsAppStudyPanel
            userId={userId}
            questionId={question.id}
            notebookId={whatsappOverlay?.notebookId ?? current?.notebook_id ?? notebookId}
            shortIdHint={whatsappOverlay?.shortId ?? current?.short_id}
          forceEnabled={Boolean(whatsappOverlay?.enabled)}
            questionType={question.type}
            options={options}
            selected={selected}
            tags={waTags}
            onTagsChange={setWaTags}
          />
        </aside>

        <div className="order-3 space-y-4 lg:col-start-1 lg:row-start-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Alternativas
            </p>
            <QuestionOptions
              options={options}
              questionType={question.type}
              selected={selected}
              eliminated={eliminated}
              locked={locked}
              result={result}
              onSelect={handleSelect}
              onToggleEliminated={handleToggleEliminated}
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <ConfidenceToggles
              value={confidence}
              disabled={locked}
              onChange={handleConfidenceChange}
            />
            {resolveError && (
              <p className="mb-3 text-sm text-red-600">{resolveError}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleResolve}
                disabled={!selected || locked}
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Resolver questão
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
                {result.is_correct
                  ? "Você acertou!"
                  : `Você errou! Gabarito: ${result.correct_answer}.`}
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
          </section>
        </div>
      </div>

      {mode !== "solo" && <StudyNavBar onNavigate={navigate} />}

      {mode === "solo" && returnHref && (
        <p className="text-center text-xs text-slate-500">
          Modo prática avulsa — a tentativa entra nas estatísticas e no cérebro da matéria
          (se mapeada).{" "}
          <Link href={returnHref} className="font-medium text-blue-600 hover:underline">
            Voltar
          </Link>
        </p>
      )}

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
