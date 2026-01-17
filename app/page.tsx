"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import AddErrorModal from "@/components/AddErrorModal"
import SettingsModal from "@/components/SettingsModal"
import ErrorsByPeriodChart from "@/components/ErrorsByPeriodChart"
import ErrorsBySubjectChart from "@/components/ErrorsBySubjectChart"
import { Plus, Settings } from "lucide-react"

type Subject = {
  id: string
  name: string
}

type Error = {
  id: string
  created_at: string
  topics: {
    subjects: {
      id: string
      name: string
    }
  }
}

export default function Home() {
  const router = useRouter()

  const [isAddErrorOpen, setIsAddErrorOpen] = useState(false)
  const [openSettings, setOpenSettings] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [errors, setErrors] = useState<Error[]>([])

  async function loadUser() {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (user) {
      setUserId(user.id)
      loadSubjects(user.id)
      loadErrors(user.id)
    } else {
      router.push("/login")
    }
  }

  // 📚 MATÉRIAS
  async function loadSubjects(user_id: string) {
    const res = await fetch(`/api/subjects?user_id=${user_id}`)
    const data = await res.json()
    setSubjects(data)
  }

  // 📊 ERROS (para os gráficos)
  async function loadErrors(user_id: string) {
    const res = await fetch(`/api/errors?user_id=${user_id}`)
    const data = await res.json()
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
          Mapa de correção de erros
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

      {/* CHARTS */}
      <section className="mb-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <ErrorsByPeriodChart errors={errors} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <ErrorsBySubjectChart errors={errors} />
        </div>
      </section>

      {/* GRID DE MATÉRIAS */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-700">
          Matérias
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {subjects.map(subject => (
            <button
              key={subject.id}
              onClick={() => router.push(`/subject/${subject.id}`)}
              className="flex h-24 items-center justify-center rounded-xl bg-white text-slate-800 shadow-sm transition hover:shadow-md hover:ring-2 hover:ring-slate-300"
            >
              <span className="text-base font-medium">
                {subject.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      <AddErrorModal
        isOpen={isAddErrorOpen}
        onClose={() => setIsAddErrorOpen(false)}
        onSuccess={() => {
          if (userId) {
            loadErrors(userId)
          }
        }}
      />
      
      {userId && (
        <SettingsModal
          open={openSettings}
          onClose={() => {
            setOpenSettings(false)
            loadSubjects(userId)
          }}
          userId={userId}
        />
      )}
    </main>
  )
}
