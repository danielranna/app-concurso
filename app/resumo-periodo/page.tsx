"use client"

import { useEffect, useLayoutEffect, useState, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, ChevronDown, ChevronUp, CalendarRange, X } from "lucide-react"
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
  topics: {
    id: string
    name: string
    subjects: {
      id: string
      name: string
    }
  }
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

  type Period = "this_week" | "last_week" | "accumulated" | "custom"
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

  async function loadUser() {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (user) {
      setUserId(user.id)
      loadErrors(user.id)
      loadErrorStatuses(user.id)
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
    if (!statusFromUrl && typeFromUrl === "total" && !periodFromUrl && !allFromUrl) return

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
    if (filterType === "total") return periodErrors
    const name = filterType.toLowerCase().trim()
    return periodErrors.filter(e => (e.error_status || "").toLowerCase().trim() === name)
  }, [periodErrors, filterType])

  const getPeriodLabel = () => {
    if (period === "accumulated") return " (Acumulado)"
    if (period === "last_week") return " (Última Semana)"
    if (period === "custom" && fromParam && toParam) return ` (${fromParam} a ${toParam})`
    if (period === "custom") return " (Entre datas)"
    return " (Esta Semana)"
  }

  const getTitle = () => {
    const suffix = getPeriodLabel()
    if (filterType === "total") return `Total de Erros${suffix}`
    return `Erros: ${filterType}${suffix}`
  }

  const emptyMessage = () => {
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

        {/* Spacer */}
        <div className="flex-1" />

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
        {filteredErrors.length > 0 ? (
          filteredErrors.map(error => (
            <ErrorCard
              key={error.id}
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
            />
          ))
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
