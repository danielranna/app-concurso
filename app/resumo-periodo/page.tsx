"use client"

import { useEffect, useLayoutEffect, useState, useMemo, Suspense, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, ChevronDown, ChevronUp, CalendarRange, X, PlayCircle, Pause, XCircle, Flag, AlertTriangle, RotateCcw } from "lucide-react"
import ErrorCard from "@/components/ErrorCard"
import AddErrorModal from "@/components/AddErrorModal"

type Error = {
  id: string
  created_at: string
  error_text: string
  correction_text: string
  description?: string
  reference_link?: string
  error_status?: string
  error_type?: string
  review_count?: number
  needs_intervention?: boolean
  topics: {
    id: string
    name: string
    subjects: {
      id: string
      name: string
    }
  }
}

type Period = "this_week" | "last_week" | "accumulated" | "custom"

type ReviewSession = {
  id: string
  user_id: string
  filters: Record<string, unknown>
  card_ids: string[]
  reviewed_card_ids: string[]
  status: string
  created_at: string
  updated_at: string
}

type ReviewFilters = {
  reviewName: string
  subjectIds: string[]
  errorTypes: string[]
  /** Vazio = todos os status (comportamento igual ao "Total" do dropdown) */
  errorStatuses?: string[]
  period: Period
  customFrom?: string
  customTo?: string
}

function formatDateForInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function ResumoPeriodoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [userId, setUserId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Error[]>([])
  const [errorStatuses, setErrorStatuses] = useState<Array<{ id: string; name: string; color?: string | null }>>([])
  const [allCardsExpanded, setAllCardsExpanded] = useState(false)
  const [editingError, setEditingError] = useState<Error | null>(null)

  // Filtro: lê da URL na montagem (window) e depois sincroniza com searchParams
  const [filterType, setFilterType] = useState<string>(() => {
    if (typeof window === "undefined") return "total"
    const params = new URLSearchParams(window.location.search)
    const status = params.get("status")
    if (status) {
      try { return decodeURIComponent(status) }
      catch { return status }
    }
    return params.get("type") || "total"
  })

  const getWeekStart = (date: Date): Date => {
    const dayOfWeek = date.getDay()
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - diff)
    weekStart.setHours(0, 0, 0, 0)
    return weekStart
  }

  const getDefaultCustomRange = (): { from: string; to: string } => {
    const now = new Date()
    const start = getWeekStart(now)
    return { from: formatDateForInput(start), to: formatDateForInput(now) }
  }

  const getInitialPeriod = (): Period => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      if (params.get("all") === "true") return "accumulated"
      const p = params.get("period")
      if (p === "this_week" || p === "last_week" || p === "accumulated" || p === "custom") return p
    }
    if (searchParams?.get("all") === "true") return "accumulated"
    const p = searchParams?.get("period")
    if (p === "this_week" || p === "last_week" || p === "accumulated" || p === "custom") return p
    return "last_week"
  }
  const [period, setPeriod] = useState<Period>(getInitialPeriod())

  const fromParam = searchParams?.get("from") ?? ""
  const toParam = searchParams?.get("to") ?? ""
  const [customFrom, setCustomFrom] = useState(fromParam || getDefaultCustomRange().from)
  const [customTo, setCustomTo] = useState(toParam || getDefaultCustomRange().to)

  // Dropdowns e popup
  const [showTypeDropdown, setShowTypeDropdown] = useState(false)
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showZoneDropdown, setShowZoneDropdown] = useState(false)
  
  // Filtro de zonas (cards problemáticos)
  const [showCriticalZone, setShowCriticalZone] = useState(() => {
    if (typeof window === "undefined") return false
    const params = new URLSearchParams(window.location.search)
    return params.get("critical") === "true" || params.get("flagged") === "true"
  })
  const [showAttentionZone, setShowAttentionZone] = useState(() => {
    if (typeof window === "undefined") return false
    return new URLSearchParams(window.location.search).get("attention") === "true"
  })
  
  // IDs de cards por zona (carregados da API de análise)
  const [criticalCardIds, setCriticalCardIds] = useState<Set<string>>(new Set())
  const [attentionCardIds, setAttentionCardIds] = useState<Set<string>>(new Set())

  // Estados de revisão
  const [reviewSessions, setReviewSessions] = useState<ReviewSession[]>([])
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null)
  const [showReviewSelectorModal, setShowReviewSelectorModal] = useState(false)
  const [showReviewConfigModal, setShowReviewConfigModal] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [removingCardId, setRemovingCardId] = useState<string | null>(null)
  const [reviewName, setReviewName] = useState("")
  const [reviewSubjectIds, setReviewSubjectIds] = useState<string[]>([])
  const [reviewErrorTypes, setReviewErrorTypes] = useState<string[]>([])
  /** "all" = todos os status; array = apenas esses (OR) */
  const [reviewStatusFilter, setReviewStatusFilter] = useState<"all" | string[]>("all")
  const [reviewPeriod, setReviewPeriod] = useState<Period>("last_week")
  const [reviewCustomFrom, setReviewCustomFrom] = useState(getDefaultCustomRange().from)
  const [reviewCustomTo, setReviewCustomTo] = useState(getDefaultCustomRange().to)

  async function loadAnalysisZones(user_id: string) {
    try {
      const res = await fetch(`/api/analysis?user_id=${user_id}`)
      const data = await res.json()
      
      if (data.cards && data.config) {
        const threshold = data.config.problem_threshold ?? 10
        const outlierPercentage = data.config.outlier_percentage ?? 10
        
        // Calcula threshold de outliers
        const indices = data.cards
          .map((c: { problem_index: number }) => c.problem_index)
          .filter((idx: number) => idx >= threshold)
          .sort((a: number, b: number) => a - b)
        const percentile = (100 - outlierPercentage) / 100
        const outlierThreshold = indices.length > 0 
          ? indices[Math.floor(indices.length * percentile)] || indices[indices.length - 1]
          : Infinity
        
        // IDs da Zona Crítica (flagados + outliers)
        const critical = new Set<string>()
        // IDs da Zona de Atenção (índice >= threshold mas < outlier e não flagado)
        const attention = new Set<string>()
        
        data.cards.forEach((card: { id: string; needs_intervention: boolean; problem_index: number }) => {
          if (card.needs_intervention) {
            critical.add(card.id)
          } else if (card.problem_index >= outlierThreshold && card.problem_index > 0) {
            critical.add(card.id)
          } else if (card.problem_index >= threshold && card.problem_index > 0) {
            attention.add(card.id)
          }
        })
        
        setCriticalCardIds(critical)
        setAttentionCardIds(attention)
      }
    } catch (error) {
      console.error("Erro ao carregar zonas de análise:", error)
    }
  }

  async function loadUser() {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (user) {
      setUserId(user.id)
      loadErrors(user.id)
      loadErrorStatuses(user.id)
      loadReviewSession(user.id)
      loadAnalysisZones(user.id)
    } else {
      router.push("/login")
    }
  }

  async function loadErrors(user_id: string) {
    const res = await fetch(`/api/errors?user_id=${user_id}`)
    const data = await res.json()
    setErrors(data ?? [])
  }

  async function loadErrorStatuses(user_id: string) {
    const res = await fetch(`/api/error-statuses?user_id=${user_id}`)
    const data = await res.json()
    setErrorStatuses(data ?? [])
  }

  // Funções de revisão
  const loadReviewSession = useCallback(async (user_id: string) => {
    try {
      const res = await fetch(`/api/review-sessions?user_id=${user_id}`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setReviewSessions(data)
        if (data.length === 0) {
          setReviewSession(null)
          return
        }

        const savedSessionId = typeof window !== "undefined"
          ? window.localStorage.getItem("active_review_session_id")
          : null

        const selected = data.find((s: ReviewSession) => s.id === savedSessionId) || data[0]
        setReviewSession(selected)
      } else {
        setReviewSessions([])
        setReviewSession(null)
      }
    } catch (error) {
      console.error("Erro ao carregar sessão de revisão:", error)
    }
  }, [])

  // startNewReview é definida após filteredErrors (veja abaixo)

  const continueReview = useCallback(async () => {
    if (!reviewSession?.id) return
    if (typeof window !== "undefined") {
      window.localStorage.setItem("active_review_session_id", reviewSession.id)
    }
    try {
      await fetch(`/api/review-sessions/${reviewSession.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" })
      })
    } catch (error) {
      console.error("Erro ao retomar revisão:", error)
    }
    setReviewMode(true)
    setShowReviewSelectorModal(false)
  }, [reviewSession])

  const cancelReview = useCallback(async () => {
    if (!reviewSession?.id) return
    setReviewLoading(true)

    try {
      await fetch(`/api/review-sessions/${reviewSession.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" })
      })
      const remainingSessions = reviewSessions.filter(s => s.id !== reviewSession.id)
      setReviewSessions(remainingSessions)
      setReviewSession(remainingSessions[0] || null)
      setReviewMode(false)
      setShowReviewSelectorModal(false)
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("active_review_session_id")
      }
    } catch (error) {
      console.error("Erro ao cancelar revisão:", error)
    } finally {
      setReviewLoading(false)
    }
  }, [reviewSession, reviewSessions])

  const pauseReview = useCallback(() => {
    setReviewMode(false)
  }, [])

  const markCardAsReviewed = useCallback(async (cardId: string) => {
    if (!reviewSession?.id) return

    // Animação de remoção
    setRemovingCardId(cardId)

    try {
      const res = await fetch(`/api/review-sessions/${reviewSession.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_reviewed", card_id: cardId })
      })

      if (res.ok) {
        // Atualiza sessão local
        setTimeout(() => {
          setReviewSession(prev => {
            if (!prev) return null
            const newReviewedIds = [...(prev.reviewed_card_ids || []), cardId]
            
            // Verifica se todos foram revisados
            if (newReviewedIds.length >= prev.card_ids.length) {
              setReviewMode(false)
            }
            
            return {
              ...prev,
              reviewed_card_ids: newReviewedIds
            }
          })
          setReviewSessions(prev =>
            prev.map(session =>
              session.id === reviewSession.id
                ? {
                    ...session,
                    reviewed_card_ids: (session.reviewed_card_ids || []).includes(cardId)
                      ? (session.reviewed_card_ids || [])
                      : [...(session.reviewed_card_ids || []), cardId]
                  }
                : session
            )
          )
          setRemovingCardId(null)
        }, 300) // Tempo da animação
      }
    } catch (error) {
      console.error("Erro ao marcar card como revisado:", error)
      setRemovingCardId(null)
    }
  }, [reviewSession])

  useEffect(() => {
    loadUser()
  }, [])

  useEffect(() => {
    const hasAll = searchParams?.get("all") === "true"
    const hasPeriod = searchParams?.get("period")
    if (!hasAll && !hasPeriod) {
      const params = new URLSearchParams(searchParams?.toString() || "")
      params.set("period", "last_week")
      router.replace(`/resumo-periodo?${params.toString()}`, { scroll: false })
      return
    }
    const p = searchParams?.get("period")
    if (p === "custom" && (!fromParam || !toParam)) {
      const params = new URLSearchParams(searchParams?.toString() || "")
      const { from, to } = getDefaultCustomRange()
      params.set("period", "custom")
      params.set("from", from)
      params.set("to", to)
      router.replace(`/resumo-periodo?${params.toString()}`, { scroll: false })
    }
  }, [router, searchParams, fromParam, toParam])

  // Sincroniza filtro e período com a URL
  const searchString = typeof searchParams?.toString === "function" ? searchParams.toString() : ""

  // No cliente, ao montar: lê a URL real antes de pintar (evita flash "total")
  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    const p = new URLSearchParams(window.location.search)
    const s = p.get("status")
    if (s) {
      try { setFilterType(decodeURIComponent(s)) } catch { setFilterType(s) }
    } else {
      setFilterType(p.get("type") || "total")
    }
    if (p.get("all") === "true") {
      setPeriod("accumulated")
    } else {
      const periodVal = p.get("period")
      if (periodVal === "this_week" || periodVal === "last_week" || periodVal === "accumulated" || periodVal === "custom") {
        setPeriod(periodVal)
        if (periodVal === "custom") {
          const f = p.get("from") ?? getDefaultCustomRange().from
          const t = p.get("to") ?? getDefaultCustomRange().to
          setCustomFrom(f)
          setCustomTo(t)
        }
      }
    }
  }, []) // só na montagem (cliente)

  // Quando searchParams mudar (ex.: dropdown), sincroniza de novo
  useEffect(() => {
    const statusFromUrl = searchParams?.get("status") ?? ""
    const typeFromUrl = searchParams?.get("type") ?? "total"
    const periodFromUrl = searchParams?.get("period") ?? ""
    const allFromUrl = searchParams?.get("all") ?? ""
    const criticalFromUrl = searchParams?.get("critical") ?? ""
    const attentionFromUrl = searchParams?.get("attention") ?? ""
    const flaggedFromUrl = searchParams?.get("flagged") ?? "" // Compatibilidade com URL antiga
    if (!statusFromUrl && typeFromUrl === "total" && !periodFromUrl && !allFromUrl && !criticalFromUrl && !attentionFromUrl && !flaggedFromUrl) return

    if (statusFromUrl) {
      try { setFilterType(decodeURIComponent(statusFromUrl)) } catch { setFilterType(statusFromUrl) }
    } else {
      setFilterType(typeFromUrl === "total" ? "total" : typeFromUrl)
    }
    if (allFromUrl === "true") setPeriod("accumulated")
    else if (["this_week", "last_week", "accumulated", "custom"].includes(periodFromUrl)) {
      setPeriod(periodFromUrl as Period)
      if (periodFromUrl === "custom") {
        const f = searchParams?.get("from") ?? getDefaultCustomRange().from
        const t = searchParams?.get("to") ?? getDefaultCustomRange().to
        setCustomFrom(f)
        setCustomTo(t)
      }
    }
    // Sincroniza filtros de zona (critical pode vir de flagged para compatibilidade)
    setShowCriticalZone(criticalFromUrl === "true" || flaggedFromUrl === "true")
    setShowAttentionZone(attentionFromUrl === "true")
  }, [searchString])

  function updateUrlPeriod(next: Period) {
    setPeriod(next)
    const params = new URLSearchParams(searchParams?.toString() || "")
    params.delete("all")
    params.delete("from")
    params.delete("to")
    params.set("period", next)
    if (next === "custom") {
      const { from, to } = getDefaultCustomRange()
      params.set("from", from)
      params.set("to", to)
      setCustomFrom(from)
      setCustomTo(to)
    }
    router.replace(`/resumo-periodo?${params.toString()}`, { scroll: false })
  }

  function applyCustomRange() {
    const params = new URLSearchParams(searchParams?.toString() || "")
    params.delete("all")
    params.set("period", "custom")
    params.set("from", customFrom)
    params.set("to", customTo)
    router.replace(`/resumo-periodo?${params.toString()}`, { scroll: false })
  }

  function updateUrlFilter(value: string) {
    setFilterType(value)
    const params = new URLSearchParams(searchParams?.toString() || "")
    if (value === "total") {
      params.delete("status")
      params.set("type", "total")
    } else {
      params.delete("type")
      params.set("status", encodeURIComponent(value))
    }
    router.replace(`/resumo-periodo?${params.toString()}`, { scroll: false })
  }

  function toggleCriticalZone() {
    const newValue = !showCriticalZone
    setShowCriticalZone(newValue)
    const params = new URLSearchParams(searchParams?.toString() || "")
    params.delete("flagged") // Remove parâmetro antigo
    if (newValue) {
      params.set("critical", "true")
    } else {
      params.delete("critical")
    }
    router.replace(`/resumo-periodo?${params.toString()}`, { scroll: false })
  }

  function toggleAttentionZone() {
    const newValue = !showAttentionZone
    setShowAttentionZone(newValue)
    const params = new URLSearchParams(searchParams?.toString() || "")
    if (newValue) {
      params.set("attention", "true")
    } else {
      params.delete("attention")
    }
    router.replace(`/resumo-periodo?${params.toString()}`, { scroll: false })
  }

  const periodErrors = useMemo(() => {
    if (period === "accumulated") return errors

    const now = new Date()
    const thisWeekStart = getWeekStart(now)
    let rangeStart: Date
    let rangeEnd: Date

    if (period === "this_week") {
      rangeStart = new Date(thisWeekStart)
      rangeEnd = new Date(rangeStart)
      rangeEnd.setDate(rangeStart.getDate() + 6)
      rangeEnd.setHours(23, 59, 59, 999)
    } else if (period === "last_week") {
      rangeStart = new Date(thisWeekStart)
      rangeStart.setDate(thisWeekStart.getDate() - 7)
      rangeEnd = new Date(rangeStart)
      rangeEnd.setDate(rangeStart.getDate() + 6)
      rangeEnd.setHours(23, 59, 59, 999)
    } else {
      if (!fromParam || !toParam) return []
      const start = new Date(fromParam)
      const end = new Date(toParam)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return []
      rangeStart = start
      rangeStart.setHours(0, 0, 0, 0)
      rangeEnd = end
      rangeEnd.setHours(23, 59, 59, 999)
    }

    return errors.filter(error => {
      const errorDate = new Date(error.created_at)
      return errorDate >= rangeStart && errorDate <= rangeEnd
    })
  }, [errors, period, fromParam, toParam])

  const filteredErrors = useMemo(() => {
    let result = periodErrors
    
    // Filtro por zonas (crítica e/ou atenção)
    if (showCriticalZone || showAttentionZone) {
      result = result.filter(e => {
        if (showCriticalZone && showAttentionZone) {
          return criticalCardIds.has(e.id) || attentionCardIds.has(e.id)
        } else if (showCriticalZone) {
          return criticalCardIds.has(e.id)
        } else if (showAttentionZone) {
          return attentionCardIds.has(e.id)
        }
        return true
      })
    }
    
    // Filtro por status
    if (filterType !== "total") {
      const name = filterType.toLowerCase().trim()
      result = result.filter(e => (e.error_status || "").toLowerCase().trim() === name)
    }
    
    return result
  }, [periodErrors, filterType, showCriticalZone, showAttentionZone, criticalCardIds, attentionCardIds])

  const subjectOptions = useMemo(() => {
    const map = new Map<string, string>()
    errors.forEach(error => {
      if (error.topics?.subjects?.id && error.topics?.subjects?.name) {
        map.set(error.topics.subjects.id, error.topics.subjects.name)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [errors])

  const errorTypeOptions = useMemo(() => {
    const uniqueTypes = new Set<string>()
    errors.forEach(error => {
      if (error.error_type?.trim()) uniqueTypes.add(error.error_type.trim())
    })
    return Array.from(uniqueTypes).sort((a, b) => a.localeCompare(b))
  }, [errors])

  function filterErrorsByReviewPeriod(source: Error[], selectedPeriod: Period, from?: string, to?: string) {
    if (selectedPeriod === "accumulated") return source

    const now = new Date()
    const thisWeekStart = getWeekStart(now)
    let rangeStart: Date
    let rangeEnd: Date

    if (selectedPeriod === "this_week") {
      rangeStart = new Date(thisWeekStart)
      rangeEnd = new Date(rangeStart)
      rangeEnd.setDate(rangeStart.getDate() + 6)
      rangeEnd.setHours(23, 59, 59, 999)
    } else if (selectedPeriod === "last_week") {
      rangeStart = new Date(thisWeekStart)
      rangeStart.setDate(thisWeekStart.getDate() - 7)
      rangeEnd = new Date(rangeStart)
      rangeEnd.setDate(rangeStart.getDate() + 6)
      rangeEnd.setHours(23, 59, 59, 999)
    } else {
      if (!from || !to) return []
      const start = new Date(from)
      const end = new Date(to)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return []
      rangeStart = start
      rangeStart.setHours(0, 0, 0, 0)
      rangeEnd = end
      rangeEnd.setHours(23, 59, 59, 999)
    }

    return source.filter(error => {
      const errorDate = new Date(error.created_at)
      return errorDate >= rangeStart && errorDate <= rangeEnd
    })
  }

  const reviewPeriodErrorsForModal = useMemo(
    () => filterErrorsByReviewPeriod(errors, reviewPeriod, reviewCustomFrom, reviewCustomTo),
    [errors, reviewPeriod, reviewCustomFrom, reviewCustomTo]
  )

  const reviewStatusOptionsForModal = useMemo(() => {
    const total = reviewPeriodErrorsForModal.length
    const statuses = (errorStatuses || []).map(s => {
      const name = (typeof s === "string" ? s : (s.name ?? "")).trim()
      const color = typeof s === "object" && s.color ? s.color : "#64748b"
      const count = reviewPeriodErrorsForModal.filter(
        e => (e.error_status || "").toLowerCase().trim() === name.toLowerCase()
      ).length
      return { name, color, count }
    })
    return { total, statuses }
  }, [reviewPeriodErrorsForModal, errorStatuses])

  const startNewReview = useCallback(async () => {
    if (!userId) return
    setReviewLoading(true)

    try {
      let reviewCandidates = filterErrorsByReviewPeriod(
        errors,
        reviewPeriod,
        reviewCustomFrom,
        reviewCustomTo
      )

      if (reviewSubjectIds.length > 0) {
        const selectedSubjects = new Set(reviewSubjectIds)
        reviewCandidates = reviewCandidates.filter(error =>
          selectedSubjects.has(error.topics?.subjects?.id || "")
        )
      }

      if (reviewErrorTypes.length > 0) {
        const selectedTypes = new Set(reviewErrorTypes)
        reviewCandidates = reviewCandidates.filter(error =>
          selectedTypes.has((error.error_type || "").trim())
        )
      }

      if (reviewStatusFilter !== "all" && reviewStatusFilter.length > 0) {
        const allowed = new Set(reviewStatusFilter.map(s => s.toLowerCase().trim()))
        reviewCandidates = reviewCandidates.filter(error =>
          allowed.has((error.error_status || "").toLowerCase().trim())
        )
      }

      if (reviewCandidates.length === 0) {
        setReviewLoading(false)
        return
      }

      const filters: ReviewFilters = {
        reviewName: reviewName.trim(),
        subjectIds: reviewSubjectIds,
        errorTypes: reviewErrorTypes,
        errorStatuses: reviewStatusFilter === "all" ? [] : reviewStatusFilter,
        period: reviewPeriod,
        customFrom: reviewPeriod === "custom" ? reviewCustomFrom : undefined,
        customTo: reviewPeriod === "custom" ? reviewCustomTo : undefined
      }

      const res = await fetch("/api/review-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          filters,
          card_ids: reviewCandidates.map(e => e.id)
        })
      })

      const newSession = await res.json()
      if (newSession && newSession.id) {
        const newSessions = [newSession, ...reviewSessions]
        setReviewSessions(newSessions)
        setReviewSession(newSession)
        setReviewMode(true)
        setShowReviewConfigModal(false)
        if (typeof window !== "undefined") {
          window.localStorage.setItem("active_review_session_id", newSession.id)
        }
      }
    } catch (error) {
      console.error("Erro ao iniciar revisão:", error)
    } finally {
      setReviewLoading(false)
    }
  }, [userId, errors, reviewPeriod, reviewCustomFrom, reviewCustomTo, reviewSubjectIds, reviewErrorTypes, reviewStatusFilter, reviewName, reviewSessions])

  // Cards para exibição durante a revisão (exclui os já revisados)
  const reviewErrors = useMemo(() => {
    if (!reviewMode || !reviewSession) return filteredErrors

    const reviewedIds = new Set(reviewSession.reviewed_card_ids || [])
    const sessionCardIds = new Set(reviewSession.card_ids || [])

    // Mostra cards da sessão, independente dos filtros atuais da tela
    return errors.filter(e =>
      sessionCardIds.has(e.id) && !reviewedIds.has(e.id)
    )
  }, [errors, filteredErrors, reviewMode, reviewSession])

  // Cards a serem exibidos (normal ou modo revisão)
  const displayErrors = reviewMode ? reviewErrors : filteredErrors

  // Progresso da revisão
  const reviewProgress = useMemo(() => {
    if (!reviewSession) return { reviewed: 0, total: 0, percentage: 0 }
    const reviewed = reviewSession.reviewed_card_ids?.length || 0
    const total = reviewSession.card_ids?.length || 0
    const percentage = total > 0 ? (reviewed / total) * 100 : 0
    return { reviewed, total, percentage }
  }, [reviewSession])

  const getPeriodLabel = () => {
    if (period === "accumulated") return " (Acumulado)"
    if (period === "last_week") return " (Última Semana)"
    if (period === "custom" && fromParam && toParam) return ` (${fromParam} a ${toParam})`
    if (period === "custom") return " (Entre datas)"
    return " (Esta Semana)"
  }

  const getTitle = () => {
    const suffix = getPeriodLabel()
    if (showCriticalZone && showAttentionZone) {
      return `Zona Crítica + Atenção (${filteredErrors.length})${suffix}`
    }
    if (showCriticalZone) {
      return `Zona Crítica (${criticalCardIds.size})${suffix}`
    }
    if (showAttentionZone) {
      return `Zona de Atenção (${attentionCardIds.size})${suffix}`
    }
    if (filterType === "total") return `Total de Erros${suffix}`
    return `Erros: ${filterType}${suffix}`
  }

  const emptyMessage = () => {
    if (showCriticalZone && showAttentionZone) {
      return "Nenhum card na Zona Crítica ou de Atenção. Ótimo trabalho!"
    }
    if (showCriticalZone) {
      return "Nenhum card na Zona Crítica. Ótimo trabalho!"
    }
    if (showAttentionZone) {
      return "Nenhum card na Zona de Atenção. Continue assim!"
    }
    const base = filterType === "total"
      ? "Nenhum erro registrado"
      : `Nenhum erro com status "${filterType}"`
    if (period === "accumulated") return base
    if (period === "last_week") return `${base} na última semana`
    if (period === "this_week") return `${base} nesta semana`
    if (period === "custom" && fromParam && toParam) return `${base} entre ${fromParam} e ${toParam}`
    return base
  }

  // Opções do dropdown: Total + lista de status (com contagem e cor)
  const typeOptions = useMemo(() => {
    const totalOption = { value: "total", label: "Total", count: periodErrors.length, color: "slate" as string }
    const statusOptions = (errorStatuses || []).map(s => {
      const name = typeof s === "string" ? s : (s.name ?? "")
      const color = typeof s === "object" && s.color ? s.color : "#64748b"
      const count = periodErrors.filter(
        e => (e.error_status || "").toLowerCase().trim() === name.toLowerCase().trim()
      ).length
      return { value: name, label: name, count, color }
    })
    return [totalOption, ...statusOptions]
  }, [periodErrors, errorStatuses])

  const selectedTypeOption = useMemo(() => {
    const found = typeOptions.find(o => o.value === filterType)
    if (found) return found
    if (filterType !== "total") {
      return {
        value: filterType,
        label: filterType,
        count: filteredErrors.length,
        color: "#64748b"
      }
    }
    return typeOptions[0]
  }, [typeOptions, filterType, filteredErrors.length])

  const periodOptions = [
    { value: "this_week" as const, label: "Esta semana" },
    { value: "last_week" as const, label: "Última semana" },
    { value: "accumulated" as const, label: "Acumulado" },
    { value: "custom" as const, label: "Entre datas" }
  ]

  const selectedPeriodOption = periodOptions.find(p => p.value === period) || periodOptions[0]

  const getTypeColorClasses = (color: string, selected: boolean) => {
    if (color === "red") return selected ? "bg-red-600 text-white" : "text-red-600 hover:bg-red-50"
    if (color === "orange") return selected ? "bg-orange-600 text-white" : "text-orange-600 hover:bg-orange-50"
    if (color === "green") return selected ? "bg-green-600 text-white" : "text-green-600 hover:bg-green-50"
    return selected ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
  }

  const handlePeriodSelect = (value: Period) => {
    setShowPeriodDropdown(false)
    if (value === "custom") {
      setShowDatePicker(true)
    } else {
      updateUrlPeriod(value)
    }
  }

  const handleApplyDates = () => {
    setShowDatePicker(false)
    applyCustomRange()
  }

  const openReviewConfigModal = () => {
    setReviewName("")
    setReviewSubjectIds([])
    setReviewErrorTypes([])
    setReviewStatusFilter("all")
    setReviewPeriod(period)
    setReviewCustomFrom(customFrom)
    setReviewCustomTo(customTo)
    setShowReviewConfigModal(true)
  }

  const openNewReviewFromSelector = () => {
    setShowReviewSelectorModal(false)
    openReviewConfigModal()
  }

  const toggleReviewStatusInModal = (statusName: string) => {
    setReviewStatusFilter(prev => {
      if (prev === "all") return [statusName]
      const next = prev.includes(statusName)
        ? prev.filter(x => x !== statusName)
        : [...prev, statusName]
      return next.length === 0 ? "all" : next
    })
  }

  const setCurrentReviewSession = (session: ReviewSession) => {
    setReviewSession(session)
    if (typeof window !== "undefined") {
      window.localStorage.setItem("active_review_session_id", session.id)
    }
  }

  if (!userId) return null

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
      {/* Header com Voltar e Título */}
      <header className="mb-6">
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-2 text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span>Voltar</span>
        </button>
        <h1 className="text-xl font-semibold text-slate-800 sm:text-2xl">
          {getTitle()}
        </h1>
      </header>

      {/* Filtros compactos: Erros + Período na mesma linha */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Dropdown de Tipo de Erro */}
        <div className="relative">
          <button
            onClick={() => {
              setShowTypeDropdown(!showTypeDropdown)
              setShowPeriodDropdown(false)
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <span className="text-slate-500">Erros:</span>
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold text-white ${selectedTypeOption.color?.startsWith("#") ? "" : getTypeColorClasses(selectedTypeOption.color, true)}`}
              style={selectedTypeOption.color?.startsWith("#") ? { backgroundColor: selectedTypeOption.color } : undefined}
            >
              {selectedTypeOption.label} ({selectedTypeOption.count})
            </span>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition ${showTypeDropdown ? "rotate-180" : ""}`} />
          </button>
          {showTypeDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowTypeDropdown(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {typeOptions.map(option => {
                  const isHex = option.color?.startsWith("#")
                  const borderColor = isHex ? option.color : undefined
                  return (
                    <button
                      key={option.value}
                      onClick={() => {
                        updateUrlFilter(option.value)
                        setShowTypeDropdown(false)
                      }}
                      className={`flex w-full items-center justify-between gap-2 border-l-4 py-2 pl-3 pr-3 text-left text-sm transition ${
                        filterType === option.value ? "bg-slate-50" : "hover:bg-slate-50"
                      } ${!borderColor ? "border-l-slate-300" : ""}`}
                      style={borderColor ? { borderLeftColor: borderColor } : undefined}
                    >
                      <span
                        className={isHex ? "" : getTypeColorClasses(option.color, false).replace("hover:bg-slate-50", "").replace("hover:bg-red-50", "").replace("hover:bg-orange-50", "").replace("hover:bg-green-50", "")}
                        style={isHex ? { color: option.color } : undefined}
                      >
                        {option.label}
                      </span>
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold text-white ${isHex ? "" : getTypeColorClasses(option.color, filterType === option.value)}`}
                        style={isHex ? { backgroundColor: option.color } : undefined}
                      >
                        {option.count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Dropdown de Período */}
        <div className="relative">
          <button
            onClick={() => {
              setShowPeriodDropdown(!showPeriodDropdown)
              setShowTypeDropdown(false)
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <span className="text-slate-500">Período:</span>
            <span className="font-semibold text-slate-800">
              {period === "custom" && fromParam && toParam
                ? `${fromParam} a ${toParam}`
                : selectedPeriodOption.label}
            </span>
            {period === "custom" && <CalendarRange className="h-4 w-4 text-slate-500" />}
            <ChevronDown className={`h-4 w-4 text-slate-400 transition ${showPeriodDropdown ? "rotate-180" : ""}`} />
          </button>
          {showPeriodDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowPeriodDropdown(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {periodOptions.map(option => (
                  <button
                    key={option.value}
                    onClick={() => handlePeriodSelect(option.value)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition ${
                      period === option.value ? "bg-slate-50 font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {option.value === "custom" && <CalendarRange className="h-4 w-4" />}
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Botão editar datas se custom ativo */}
        {period === "custom" && (
          <button
            onClick={() => setShowDatePicker(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            <CalendarRange className="h-4 w-4" />
            Editar datas
          </button>
        )}

        {/* Dropdown de Zona de Prioridade */}
        <div className="relative">
          <button
            onClick={() => {
              setShowZoneDropdown(!showZoneDropdown)
              setShowTypeDropdown(false)
              setShowPeriodDropdown(false)
            }}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              showCriticalZone || showAttentionZone
                ? "border-slate-400 bg-slate-100 text-slate-800"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Flag className={`h-4 w-4 ${showCriticalZone || showAttentionZone ? "text-slate-700" : "text-slate-400"}`} />
            <span>Zona de Prioridade</span>
            {(showCriticalZone || showAttentionZone) && (
              <span className="flex items-center gap-1">
                {showCriticalZone && (
                  <span className="rounded bg-red-200 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                    {criticalCardIds.size}
                  </span>
                )}
                {showAttentionZone && (
                  <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                    {attentionCardIds.size}
                  </span>
                )}
              </span>
            )}
            <ChevronDown className={`h-4 w-4 text-slate-400 transition ${showZoneDropdown ? "rotate-180" : ""}`} />
          </button>
          {showZoneDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowZoneDropdown(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-2 shadow-lg">
                <p className="px-3 pb-2 text-xs font-medium text-slate-500">Selecione as zonas:</p>
                
                {/* Checkbox Zona Crítica */}
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={showCriticalZone}
                    onChange={() => toggleCriticalZone()}
                    className="rounded border-slate-300"
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-red-500" />
                      <span className="text-sm text-slate-700">Crítica</span>
                    </div>
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                      {criticalCardIds.size}
                    </span>
                  </div>
                </label>
                
                {/* Checkbox Zona de Atenção */}
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={showAttentionZone}
                    onChange={() => toggleAttentionZone()}
                    className="rounded border-slate-300"
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="text-sm text-slate-700">Atenção</span>
                    </div>
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                      {attentionCardIds.size}
                    </span>
                  </div>
                </label>
              </div>
            </>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {!reviewMode && reviewSessions.length > 0 && (
          <button
            onClick={() => setShowReviewSelectorModal(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-100"
          >
            <PlayCircle className="h-4 w-4" />
            <span>Continuar Revisão</span>
          </button>
        )}

        {/* Botão Iniciar Revisão (só aparece quando não está em modo revisão) */}
        {!reviewMode && errors.length > 0 && (
          <button
            onClick={openReviewConfigModal}
            disabled={reviewLoading}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Iniciar Revisão</span>
            <span className="sm:hidden">Revisar</span>
          </button>
        )}

        {/* Expandir/Recolher Tudo */}
        <button
          onClick={() => setAllCardsExpanded(!allCardsExpanded)}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {allCardsExpanded ? (
            <>
              <ChevronUp className="h-4 w-4" />
              <span className="hidden sm:inline">Recolher</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              <span className="hidden sm:inline">Expandir</span>
            </>
          )}
        </button>
      </div>

      {/* Barra de progresso da revisão */}
      {reviewMode && reviewSession && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
                <PlayCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  {(reviewSession?.filters as ReviewFilters | undefined)?.reviewName?.trim()
                    ? `Revisão: ${(reviewSession.filters as ReviewFilters).reviewName}`
                    : "Revisão em Andamento"}
                </p>
                <p className="text-xs text-blue-700">
                  {reviewProgress.reviewed} de {reviewProgress.total} revisados
                </p>
              </div>
            </div>

            {/* Barra de progresso */}
            <div className="flex flex-1 items-center gap-3 min-w-[200px]">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-blue-200">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${reviewProgress.percentage}%` }}
                />
              </div>
              <span className="text-sm font-medium text-blue-900">
                {Math.round(reviewProgress.percentage)}%
              </span>
            </div>

            {/* Botões de controle */}
            <div className="flex items-center gap-2">
              <button
                onClick={pauseReview}
                className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
              >
                <Pause className="h-4 w-4" />
                Pausar
              </button>
              <button
                onClick={cancelReview}
                disabled={reviewLoading}
                className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Cancelar
              </button>
            </div>
          </div>

          {/* Mensagem de conclusão */}
          {reviewProgress.reviewed >= reviewProgress.total && reviewProgress.total > 0 && (
            <div className="mt-4 rounded-lg bg-green-100 p-3 text-center">
              <p className="text-sm font-semibold text-green-800">
                🎉 Parabéns! Você concluiu a revisão de todos os {reviewProgress.total} cards!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Popup para selecionar datas */}
      {showDatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Selecionar período</h3>
              <button
                onClick={() => setShowDatePicker(false)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Data início</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Data fim</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleApplyDates}
                  className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {displayErrors.length > 0 ? (
          displayErrors.map(error => (
            <div
              key={error.id}
              className={`transition-all duration-300 ${
                removingCardId === error.id 
                  ? "opacity-0 -translate-x-4 h-0 overflow-hidden" 
                  : "opacity-100 translate-x-0"
              }`}
            >
              <ErrorCard
                error={{
                  id: error.id,
                  error_text: error.error_text,
                  correction_text: error.correction_text,
                  description: error.description,
                  reference_link: error.reference_link,
                  error_status: error.error_status || "normal",
                  error_type: error.error_type,
                  topics: error.topics
                    ? {
                        name: error.topics.name,
                        subjects: error.topics.subjects
                      }
                    : null
                }}
                onEdit={() => setEditingError(error)}
                onDeleted={async () => {
                  await loadErrors(userId!)
                  await loadErrorStatuses(userId!)
                }}
                allCardsExpanded={allCardsExpanded}
                availableStatuses={errorStatuses}
                onStatusChange={async (errorId, newStatus) => {
                  const errorToUpdate = errors.find(e => e.id === errorId)
                  if (!errorToUpdate) return
                  const previousStatus = errorToUpdate.error_status ?? "normal"
                  // Atualização otimista: badge muda na hora
                  setErrors(prev =>
                    prev.map(e =>
                      e.id === errorId ? { ...e, error_status: newStatus } : e
                    )
                  )
                  const res = await fetch(`/api/errors/${errorId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      user_id: userId,
                      topic_id: errorToUpdate.topics.id,
                      error_text: errorToUpdate.error_text,
                      correction_text: errorToUpdate.correction_text,
                      description: errorToUpdate.description,
                      reference_link: errorToUpdate.reference_link,
                      error_type: errorToUpdate.error_type,
                      error_status: newStatus
                    })
                  })
                  if (res.ok) {
                    await loadErrorStatuses(userId!)
                    // Não chama loadErrors para não sobrescrever com dados em cache antigos
                  } else {
                    setErrors(prev =>
                      prev.map(e =>
                        e.id === errorId ? { ...e, error_status: previousStatus } : e
                      )
                    )
                  }
                }}
                reviewMode={reviewMode}
                onMarkReviewed={markCardAsReviewed}
              />
            </div>
          ))
        ) : reviewMode && reviewProgress.reviewed > 0 ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
            <p className="text-lg font-semibold text-green-800">🎉 Todos os cards foram revisados!</p>
            <p className="mt-2 text-sm text-green-600">
              Você revisou {reviewProgress.reviewed} cards nesta sessão.
            </p>
            <button
              onClick={cancelReview}
              className="mt-4 rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 transition hover:bg-green-100"
            >
              Encerrar Revisão
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-500">{emptyMessage()}</p>
          </div>
        )}
      </div>

      {editingError && userId && (
        <AddErrorModal
          isOpen={!!editingError}
          onClose={() => {
            setEditingError(null)
            loadErrors(userId)
            loadErrorStatuses(userId)
          }}
          onSuccess={() => {
            setEditingError(null)
            loadErrors(userId)
            loadErrorStatuses(userId)
          }}
          initialData={{
            id: editingError.id,
            topic_id: editingError.topics.id,
            subject_id: editingError.topics.subjects.id,
            error_text: editingError.error_text,
            correction_text: editingError.correction_text,
            description: editingError.description,
            reference_link: editingError.reference_link,
            error_type: editingError.error_type,
            error_status: editingError.error_status
          }}
        />
      )}

      {/* Modal de configuração de nova revisão */}
      {showReviewConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Configurar revisão</h3>
              <button
                onClick={() => setShowReviewConfigModal(false)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Nome da revisão</label>
                <input
                  type="text"
                  value={reviewName}
                  onChange={e => setReviewName(e.target.value)}
                  placeholder="Ex: Revisão para prova de Constitucional"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">Matérias</label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {subjectOptions.length > 0 ? subjectOptions.map(subject => (
                    <label key={subject.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={reviewSubjectIds.includes(subject.id)}
                        onChange={() => {
                          setReviewSubjectIds(prev =>
                            prev.includes(subject.id)
                              ? prev.filter(id => id !== subject.id)
                              : [...prev, subject.id]
                          )
                        }}
                      />
                      <span>{subject.name}</span>
                    </label>
                  )) : (
                    <p className="text-sm text-slate-500">Nenhuma matéria encontrada.</p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">Tipos de erro</label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {errorTypeOptions.length > 0 ? errorTypeOptions.map(errorType => (
                    <label key={errorType} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={reviewErrorTypes.includes(errorType)}
                        onChange={() => {
                          setReviewErrorTypes(prev =>
                            prev.includes(errorType)
                              ? prev.filter(type => type !== errorType)
                              : [...prev, errorType]
                          )
                        }}
                      />
                      <span>{errorType}</span>
                    </label>
                  )) : (
                    <p className="text-sm text-slate-500">Nenhum tipo de erro encontrado.</p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">Status (Erros)</label>
                <p className="mb-2 text-xs text-slate-500">
                  Mesmas categorias do filtro da página: Total ou marque um ou mais status.
                </p>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  <label className="flex cursor-pointer items-center justify-between gap-2 border-l-4 border-l-slate-300 py-2 pl-2 pr-1 text-sm text-slate-700">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={reviewStatusFilter === "all"}
                        onChange={() => setReviewStatusFilter("all")}
                        className="rounded border-slate-300"
                      />
                      <span className="font-medium">Total</span>
                    </span>
                    <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                      {reviewStatusOptionsForModal.total}
                    </span>
                  </label>
                  {reviewStatusOptionsForModal.statuses.map(s => {
                    const isHex = s.color?.startsWith("#")
                    const borderColor = isHex ? s.color : undefined
                    const isChecked =
                      reviewStatusFilter !== "all" && reviewStatusFilter.includes(s.name)
                    return (
                      <label
                        key={s.name}
                        className={`flex cursor-pointer items-center justify-between gap-2 border-l-4 py-2 pl-2 pr-1 text-sm ${
                          !borderColor ? "border-l-slate-300" : ""
                        }`}
                        style={borderColor ? { borderLeftColor: borderColor } : undefined}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleReviewStatusInModal(s.name)}
                            className="rounded border-slate-300"
                          />
                          <span
                            className={
                              isHex
                                ? "font-medium"
                                : `${getTypeColorClasses(s.color, false).replace("hover:bg-slate-50", "").replace("hover:bg-red-50", "").replace("hover:bg-orange-50", "").replace("hover:bg-green-50", "")} font-medium`
                            }
                            style={isHex ? { color: s.color } : undefined}
                          >
                            {s.name}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold text-white ${
                            isHex ? "" : getTypeColorClasses(s.color, true)
                          }`}
                          style={isHex ? { backgroundColor: s.color } : undefined}
                        >
                          {s.count}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">Período</label>
                <select
                  value={reviewPeriod}
                  onChange={e => setReviewPeriod(e.target.value as Period)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="this_week">Esta semana</option>
                  <option value="last_week">Última semana</option>
                  <option value="accumulated">Acumulado</option>
                  <option value="custom">Entre datas</option>
                </select>
              </div>

              {reviewPeriod === "custom" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-600">Data início</label>
                    <input
                      type="date"
                      value={reviewCustomFrom}
                      onChange={e => setReviewCustomFrom(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-600">Data fim</label>
                    <input
                      type="date"
                      value={reviewCustomTo}
                      onChange={e => setReviewCustomTo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowReviewConfigModal(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={startNewReview}
                  disabled={reviewLoading}
                  className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Iniciar revisão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para selecionar revisão em andamento */}
      {showReviewSelectorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Revisões em andamento</h3>
              <button
                onClick={() => setShowReviewSelectorModal(false)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto">
              {reviewSessions.length > 0 ? reviewSessions.map(session => {
                const reviewed = session.reviewed_card_ids?.length || 0
                const total = session.card_ids?.length || 0
                const sessionFilters = (session.filters || {}) as ReviewFilters
                const isSelected = reviewSession?.id === session.id

                return (
                  <button
                    key={session.id}
                    onClick={() => setCurrentReviewSession(session)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      isSelected ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {sessionFilters.reviewName?.trim() || "Revisão sem nome"}
                    </p>
                    <p className="text-xs text-slate-600">
                      {reviewed} / {total} revisados
                    </p>
                  </button>
                )
              }) : (
                <p className="py-4 text-center text-sm text-slate-500">Nenhuma revisão ativa.</p>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={openNewReviewFromSelector}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4 shrink-0" />
                Nova revisão
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={continueReview}
                  disabled={!reviewSession}
                  className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Continuar
                </button>
                <button
                  type="button"
                  onClick={cancelReview}
                  disabled={!reviewSession || reviewLoading}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                >
                  Cancelar selecionada
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default function ResumoPeriodoPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-slate-50 px-6 py-6">
        <div className="flex items-center justify-center h-screen">
          <p className="text-slate-500">Carregando...</p>
        </div>
      </main>
    }>
      <ResumoPeriodoContent />
    </Suspense>
  )
}
