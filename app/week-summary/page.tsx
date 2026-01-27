"use client"

import { useEffect, useState, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react"
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

function WeekSummaryContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [userId, setUserId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Error[]>([])
  const [errorStatuses, setErrorStatuses] = useState<Array<{ id: string; name: string; color?: string | null }>>([])
  const [allCardsExpanded, setAllCardsExpanded] = useState(false)
  const [editingError, setEditingError] = useState<Error | null>(null)
  
  // Lê o tipo da URL ou usa "total" como padrão
  const initialType = (searchParams?.get("type") || "total") as "total" | "critical" | "reincident" | "learned"
  const [filterType, setFilterType] = useState<"total" | "critical" | "reincident" | "learned">(initialType)

  // Período: esta semana | última semana | acumulado. Default: última semana (ou acumulado se all=true)
  type Period = "this_week" | "last_week" | "accumulated"
  const getInitialPeriod = (): Period => {
    if (searchParams?.get("all") === "true") return "accumulated"
    const p = searchParams?.get("period")
    if (p === "this_week" || p === "last_week" || p === "accumulated") return p
    return "last_week"
  }
  const [period, setPeriod] = useState<Period>(getInitialPeriod())

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

  // Sincroniza URL com padrão (última semana) quando não há period nem all
  useEffect(() => {
    const hasAll = searchParams?.get("all") === "true"
    const hasPeriod = searchParams?.get("period")
    if (!hasAll && !hasPeriod) {
      const params = new URLSearchParams(searchParams?.toString() || "")
      params.set("period", "last_week")
      router.replace(`/week-summary?${params.toString()}`, { scroll: false })
    }
  }, [router, searchParams])

  // Atualiza o tipo e o período quando a URL muda
  useEffect(() => {
    const type = searchParams?.get("type") || "total"
    if (["total", "critical", "reincident", "learned"].includes(type)) {
      setFilterType(type as "total" | "critical" | "reincident" | "learned")
    }
    const fromAll = searchParams?.get("all") === "true"
    const p = searchParams?.get("period")
    if (fromAll) setPeriod("accumulated")
    else if (p === "this_week" || p === "last_week" || p === "accumulated") setPeriod(p)
  }, [searchParams])

  // Calcula início da semana (Segunda-feira) para uma data
  const getWeekStart = (date: Date): Date => {
    const dayOfWeek = date.getDay()
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - diff)
    weekStart.setHours(0, 0, 0, 0)
    return weekStart
  }

  function updateUrlPeriod(next: Period) {
    setPeriod(next)
    const params = new URLSearchParams(searchParams?.toString() || "")
    params.delete("all")
    params.set("period", next)
    router.replace(`/week-summary?${params.toString()}`, { scroll: false })
  }

  function updateUrlType(next: "total" | "critical" | "reincident" | "learned") {
    setFilterType(next)
    const params = new URLSearchParams(searchParams?.toString() || "")
    params.set("type", next)
    router.replace(`/week-summary?${params.toString()}`, { scroll: false })
  }
  
  // Filtra erros por período: esta semana | última semana | acumulado
  const weekErrors = useMemo(() => {
    if (period === "accumulated") return errors

    const now = new Date()
    const thisWeekStart = getWeekStart(now)
    let weekStart: Date
    let weekEnd: Date

    if (period === "this_week") {
      weekStart = new Date(thisWeekStart)
      weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
    } else {
      // last_week: semana anterior (segunda a domingo)
      weekStart = new Date(thisWeekStart)
      weekStart.setDate(thisWeekStart.getDate() - 7)
      weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
    }

    return errors.filter(error => {
      const errorDate = new Date(error.created_at)
      return errorDate >= weekStart && errorDate <= weekEnd
    })
  }, [errors, period])

  // Filtra erros conforme o tipo selecionado
  const filteredErrors = useMemo(() => {
    if (filterType === "total") {
      return weekErrors
    }

    if (filterType === "critical") {
      return weekErrors.filter(e => {
        const status = (e.error_status || "").toLowerCase().trim()
        return status === "critico" || status === "crítico" || status.includes("critic")
      })
    }

    if (filterType === "learned") {
      return weekErrors.filter(e => {
        const status = (e.error_status || "").toLowerCase().trim()
        return status === "consolidado" || status === "aprendido" || status === "resolvido"
      })
    }

    if (filterType === "reincident") {
      return weekErrors.filter(e => {
        const status = (e.error_status || "").toLowerCase().trim()
        return status === "reincidente"
      })
    }

    return []
  }, [weekErrors, filterType])

  // Calcula estatísticas (usa weekErrors que já está filtrado corretamente)
  const stats = useMemo(() => {
    const total = weekErrors.length
    const critical = weekErrors.filter(e => {
      const status = (e.error_status || "").toLowerCase().trim()
      return status === "critico" || status === "crítico" || status.includes("critic")
    }).length
    const learned = weekErrors.filter(e => {
      const status = (e.error_status || "").toLowerCase().trim()
      return status === "consolidado" || status === "aprendido" || status === "resolvido"
    }).length
    // Calcula reincidentes (erros com status "Reincidente" - case-insensitive)
    const reincidentErrors = weekErrors.filter(e => {
      const status = (e.error_status || "").toLowerCase().trim()
      return status === "reincidente"
    }).length

    return {
      total,
      critical,
      learned,
      reincident: reincidentErrors,
      criticalPercent: total > 0 ? Math.round((critical / total) * 100) : 0,
      learnedPercent: total > 0 ? Math.round((learned / total) * 100) : 0,
      reincidentsPercent: total > 0 ? Math.round((reincidentErrors / total) * 100) : 0
    }
  }, [weekErrors])

  const getPeriodLabel = () => {
    if (period === "accumulated") return " (Acumulado)"
    if (period === "last_week") return " (Última Semana)"
    return " (Esta Semana)"
  }

  const getTitle = () => {
    const suffix = getPeriodLabel()
    switch (filterType) {
      case "critical":
        return `Erros Críticos${suffix}`
      case "reincident":
        return `Erros Reincidentes${suffix}`
      case "learned":
        return `Erros Consolidados${suffix}`
      default:
        return `Total de Erros${suffix}`
    }
  }

  if (!userId) {
    return null
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-6">
      {/* HEADER */}
      <header className="mb-6">
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-2 text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar</span>
        </button>
        <h1 className="text-2xl font-semibold text-slate-800">
          {getTitle()}
        </h1>
      </header>

      {/* FILTROS: tipo + período */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => updateUrlType("total")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filterType === "total"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Total ({stats.total})
          </button>
          <button
            onClick={() => updateUrlType("critical")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filterType === "critical"
                ? "bg-red-600 text-white"
                : "bg-white text-red-600 border border-red-200 hover:bg-red-50"
            }`}
          >
            Críticos ({stats.critical})
          </button>
          <button
            onClick={() => updateUrlType("reincident")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filterType === "reincident"
                ? "bg-orange-600 text-white"
                : "bg-white text-orange-600 border border-orange-200 hover:bg-orange-50"
            }`}
          >
            Reincidentes ({stats.reincident})
          </button>
          <button
            onClick={() => updateUrlType("learned")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filterType === "learned"
                ? "bg-green-600 text-white"
                : "bg-white text-green-600 border border-green-200 hover:bg-green-50"
            }`}
          >
            Consolidados ({stats.learned})
          </button>
        </div>
        <span className="hidden sm:inline h-6 w-px bg-slate-300" aria-hidden />
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => updateUrlPeriod("this_week")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              period === "this_week"
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Esta semana
          </button>
          <button
            onClick={() => updateUrlPeriod("last_week")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              period === "last_week"
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Última semana
          </button>
          <button
            onClick={() => updateUrlPeriod("accumulated")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              period === "accumulated"
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            Acumulado
          </button>
        </div>
      </div>

      {/* BOTÃO EXPANDIR/RECOLHER TUDO */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setAllCardsExpanded(!allCardsExpanded)}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {allCardsExpanded ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Recolher Tudo
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Expandir Tudo
            </>
          )}
        </button>
      </div>

      {/* LISTA DE ERROS */}
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
              onEdit={() => {
                setEditingError(error)
              }}
              onDeleted={async () => {
                await loadErrors(userId!)
                await loadErrorStatuses(userId!)
              }}
              allCardsExpanded={allCardsExpanded}
              availableStatuses={errorStatuses}
              onStatusChange={async (errorId, newStatus) => {
                const errorToUpdate = errors.find(e => e.id === errorId)
                if (!errorToUpdate) return

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
                  await loadErrors(userId!)
                  await loadErrorStatuses(userId!)
                }
              }}
            />
          ))
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-slate-500">
              {filterType === "total"
                ? period === "accumulated"
                  ? "Nenhum erro registrado"
                  : period === "last_week"
                    ? "Nenhum erro registrado na última semana"
                    : "Nenhum erro registrado nesta semana"
                : period === "accumulated"
                  ? `Nenhum erro ${filterType === "critical" ? "crítico" : filterType === "reincident" ? "reincidente" : "consolidado"} registrado`
                  : period === "last_week"
                    ? `Nenhum erro ${filterType === "critical" ? "crítico" : filterType === "reincident" ? "reincidente" : "consolidado"} na última semana`
                    : `Nenhum erro ${filterType === "critical" ? "crítico" : filterType === "reincident" ? "reincidente" : "consolidado"} nesta semana`}
            </p>
          </div>
        )}
      </div>

      {/* MODAL DE EDIÇÃO */}
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

export default function WeekSummaryPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-slate-50 px-6 py-6">
        <div className="flex items-center justify-center h-screen">
          <p className="text-slate-500">Carregando...</p>
        </div>
      </main>
    }>
      <WeekSummaryContent />
    </Suspense>
  )
}
