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

export default function Home() {
  const router = useRouter()
  const cache = useDataCache()

  const [isAddErrorOpen, setIsAddErrorOpen] = useState(false)
  const [openSettings, setOpenSettings] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [errorStatuses, setErrorStatuses] = useState<ErrorStatus[]>([])
  const [errors, setErrors] = useState<Error[]>([])

  async function loadUser() {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (user) {
      setUserId(user.id)
      loadSubjects(user.id)
      loadErrorStatuses(user.id)
      loadErrors(user.id)
    } else {
      router.push("/login")
    }
  }

  // 📚 MATÉRIAS
  async function loadSubjects(user_id: string) {
    const data = await cache.getSubjects(user_id)
    setSubjects(data)
  }

  // 📋 STATUS DE ERRO (para os cards)
  async function loadErrorStatuses(user_id: string) {
    const data = await cache.getErrorStatuses(user_id)
    setErrorStatuses(data ?? [])
  }

  // 📊 ERROS (para os gráficos)
  async function loadErrors(user_id: string) {
    const data = await cache.getErrors(user_id)
    setErrors(data ?? [])
  }

  useEffect(() => {
    loadUser()
  }, [])

  // Redireciona se não estiver logado
  if (!userId) {
    return null
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-6">
      {/* HEADER */}
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">
          Painel de Análise de Erros
        </h1>

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

      {/* DASHBOARD COM ABAS */}
      <section className="mb-8">
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
            if (activeTab === "tendencia") {
              return <TrendTab errors={errors} />
            }
            if (activeTab === "historico") {
              return (
                <HistoryTab
                  errors={errors}
                  errorStatuses={errorStatuses}
                  onSubjectClick={(subjectId) => router.push(`/subject/${subjectId}`)}
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
          onClose={() => {
            setOpenSettings(false)
            cache.invalidateSubjects(userId)
            cache.invalidateErrorStatuses(userId)
            loadSubjects(userId)
            loadErrorStatuses(userId)
          }}
          userId={userId}
        />
      )}
    </main>
  )
}
