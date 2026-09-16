"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import AddErrorModal from "@/components/AddErrorModal"
import SettingsModal from "@/components/SettingsModal"
import DashboardTabs from "@/components/DashboardTabs"
import WeekTab from "@/components/WeekTab"
import TrendTab from "@/components/TrendTab"
import HistoryTab from "@/components/HistoryTab"
import AnalysisTab from "@/components/AnalysisTab"
import { Plus, Settings } from "lucide-react"
import { useDataCache } from "@/contexts/DataCacheContext"
import ErrorCategorySelector from "@/components/ErrorCategorySelector"

type Subject = {
  id: string
  name: string
}

type ErrorStatus = {
  id: string
  name: string
  color?: string | null
}

type ErrorCategory = {
  id: string
  name: string
  color?: string | null
}

type Error = {
  id: string
  created_at: string
  error_status?: string
  error_type?: string
  category_id?: string | null
  topics: {
    subjects: {
      id: string
      name: string
    }
  }
}

export default function ErrosPage() {
  const router = useRouter()
  const cache = useDataCache()

  const [isAddErrorOpen, setIsAddErrorOpen] = useState(false)
  const [openSettings, setOpenSettings] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [errorStatuses, setErrorStatuses] = useState<ErrorStatus[]>([])
  const [categories, setCategories] = useState<ErrorCategory[]>([])
  const [errors, setErrors] = useState<Error[]>([])
  const [dashboardKey, setDashboardKey] = useState(0)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [userPreferences, setUserPreferences] = useState<{
    history_chart_statuses?: string[]
    active_error_category_id?: string | null
  }>({})

  async function loadUserPreferences(user_id: string) {
    try {
      const res = await fetch(`/api/user-preferences?user_id=${user_id}`)
      const data = await res.json()
      setUserPreferences(data || {})
      setActiveCategoryId(data?.active_error_category_id ?? null)
    } catch (error) {
      console.error("Erro ao carregar preferências:", error)
    }
  }

  async function setActiveCategory(categoryId: string | null) {
    if (!userId) return
    setActiveCategoryId(categoryId)
    setUserPreferences((prev) => ({
      ...prev,
      active_error_category_id: categoryId,
    }))
    try {
      await fetch("/api/user-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          active_error_category_id: categoryId,
        }),
      })
    } catch (e) {
      console.error(e)
    }
    cache.invalidateErrors(userId)
    await loadErrors(userId, categoryId)
    setDashboardKey((k) => k + 1)
  }

  async function saveHistoryChartStatus(statusId: string) {
    if (!userId) return
    try {
      await fetch("/api/user-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          history_chart_statuses: [statusId],
        }),
      })
      setUserPreferences((prev) => ({ ...prev, history_chart_statuses: [statusId] }))
    } catch (error) {
      console.error("Erro ao salvar preferência:", error)
    }
  }

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      setUserId(user.id)
      const prefsRes = await fetch(`/api/user-preferences?user_id=${user.id}`)
      const prefs = await prefsRes.json().catch(() => ({}))
      const catId = prefs?.active_error_category_id ?? null
      setUserPreferences(prefs || {})
      setActiveCategoryId(catId)
      await Promise.all([
        loadSubjects(user.id),
        loadErrorStatuses(user.id),
        loadCategories(user.id),
        loadErrors(user.id, catId),
      ])
    } else {
      router.push("/login")
    }
  }

  async function loadSubjects(user_id: string) {
    const data = await cache.getSubjects(user_id)
    setSubjects(data)
  }

  async function loadErrorStatuses(user_id: string) {
    const data = await cache.getErrorStatuses(user_id)
    setErrorStatuses(data ?? [])
  }

  async function loadCategories(user_id: string) {
    const data = await cache.getErrorCategories(user_id)
    setCategories(data ?? [])
  }

  async function loadErrors(user_id: string, categoryId?: string | null) {
    const data = await cache.getErrors(user_id, {
      category_id: categoryId === undefined ? activeCategoryId : categoryId,
    })
    setErrors(data ?? [])
  }

  async function refreshDataAfterSettings() {
    if (!userId) return
    cache.invalidateSubjects(userId)
    cache.invalidateErrorStatuses(userId)
    cache.invalidateErrorTypes(userId)
    cache.invalidateErrorCategories(userId)
    cache.invalidateErrors(userId)
    await Promise.all([
      loadSubjects(userId),
      loadErrorStatuses(userId),
      loadCategories(userId),
      loadErrors(userId, activeCategoryId),
    ])
  }

  useEffect(() => {
    loadUser()
  }, [])

  if (!userId) return null

  return (
    <main className="px-4 py-4 sm:px-6 sm:py-6">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-slate-800 sm:text-2xl">
          Painel de Análise de Erros
        </h1>
        <div className="flex shrink-0 gap-2 sm:gap-3">
          <Link
            href="/erros/revisao"
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
          >
            Revisar erros (C/E)
          </Link>
          <button
            onClick={() => setIsAddErrorOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            <span>Adicionar</span>
          </button>
          <button
            onClick={() => setOpenSettings(true)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 transition hover:bg-slate-100"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="mb-4">
        <ErrorCategorySelector
          categories={categories}
          activeCategoryId={activeCategoryId}
          onChange={(id) => void setActiveCategory(id)}
        />
      </div>

      <section className="mb-8" key={dashboardKey}>
        <DashboardTabs>
          {(activeTab) => {
            if (activeTab === "semana") {
              return (
                <WeekTab
                  errors={errors}
                  subjects={subjects}
                  errorStatuses={errorStatuses}
                  onSubjectClick={(subjectId) => router.push(`/subject/${subjectId}`)}
                />
              )
            }
            if (activeTab === "tendencia") return <TrendTab errors={errors} />
            if (activeTab === "historico") {
              return (
                <HistoryTab
                  errors={errors}
                  errorStatuses={errorStatuses}
                  onSubjectClick={(subjectId) => router.push(`/subject/${subjectId}`)}
                  savedStatusId={userPreferences.history_chart_statuses?.[0]}
                  onStatusChange={saveHistoryChartStatus}
                />
              )
            }
            if (activeTab === "analise") {
              return (
                <AnalysisTab
                  userId={userId}
                  subjects={subjects}
                  errorStatuses={errorStatuses}
                  categoryId={activeCategoryId}
                />
              )
            }
            return null
          }}
        </DashboardTabs>
      </section>

      <AddErrorModal
        isOpen={isAddErrorOpen}
        onClose={() => setIsAddErrorOpen(false)}
        onSuccess={() => {
          if (userId) {
            cache.invalidateErrors(userId)
            cache.invalidateErrorStatuses(userId)
            loadErrorStatuses(userId)
            loadErrors(userId)
          }
        }}
      />

      {userId && (
        <SettingsModal
          open={openSettings}
          onClose={async () => {
            setOpenSettings(false)
            await refreshDataAfterSettings()
            setDashboardKey((k) => k + 1)
          }}
          onDataChange={async () => {
            await refreshDataAfterSettings()
            setDashboardKey((k) => k + 1)
          }}
          userId={userId}
        />
      )}
    </main>
  )
}
