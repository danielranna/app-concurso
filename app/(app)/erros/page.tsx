"use client"

import { useEffect, useState } from "react"
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

type Subject = {
  id: string
  name: string
}

type ErrorStatus = {
  id: string
  name: string
  color?: string | null
}

type Error = {
  id: string
  created_at: string
  error_status?: string
  error_type?: string
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
  const [errors, setErrors] = useState<Error[]>([])
  const [dashboardKey, setDashboardKey] = useState(0)
  const [userPreferences, setUserPreferences] = useState<{ history_chart_statuses?: string[] }>({})

  async function loadUserPreferences(user_id: string) {
    try {
      const res = await fetch(`/api/user-preferences?user_id=${user_id}`)
      const data = await res.json()
      setUserPreferences(data || {})
    } catch (error) {
      console.error("Erro ao carregar preferências:", error)
    }
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
      loadSubjects(user.id)
      loadErrorStatuses(user.id)
      loadErrors(user.id)
      loadUserPreferences(user.id)
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

  async function loadErrors(user_id: string) {
    const data = await cache.getErrors(user_id)
    setErrors(data ?? [])
  }

  async function refreshDataAfterSettings() {
    if (!userId) return
    cache.invalidateSubjects(userId)
    cache.invalidateErrorStatuses(userId)
    cache.invalidateErrorTypes(userId)
    cache.invalidateErrors(userId)
    const [subjectsRes, statusesRes, errorsRes] = await Promise.all([
      fetch(`/api/subjects?user_id=${userId}`),
      fetch(`/api/error-statuses?user_id=${userId}`),
      fetch(`/api/errors?user_id=${userId}`),
    ])
    const subjectsData = await subjectsRes.json()
    const statusesData = await statusesRes.json()
    const statusesNormalized = (statusesData ?? []).map((item: unknown, i: number) =>
      typeof item === "string"
        ? { id: `status-${i}`, name: item, color: null }
        : {
            id: (item as { id?: string }).id ?? `status-${i}`,
            name: (item as { name?: string }).name ?? (item as string),
            color: (item as { color?: string | null }).color ?? null,
          }
    )
    const errorsData = await errorsRes.json()
    setSubjects(subjectsData ?? [])
    setErrorStatuses(statusesNormalized)
    setErrors(
      (errorsData ?? []).map((e: { error_status?: string }) => ({
        ...e,
        error_status: e.error_status ?? "normal",
      }))
    )
  }

  useEffect(() => {
    loadUser()
  }, [])

  if (!userId) return null

  return (
    <main className="px-6 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Painel de Análise de Erros</h1>
        <div className="flex gap-3">
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
                <AnalysisTab userId={userId} subjects={subjects} errorStatuses={errorStatuses} />
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
