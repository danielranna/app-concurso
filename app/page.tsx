"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import AddErrorModal from "@/components/AddErrorModal"

type Subject = {
  id: string
  name: string
}

export default function Home() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [isAddErrorOpen, setIsAddErrorOpen] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])

  // 🔐 LOGIN
  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage("")
      loadUser()
    }
  }

  async function loadUser() {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (user) {
      setUserId(user.id)
      loadSubjects(user.id)
    }
  }

  // 📚 MATÉRIAS
  async function loadSubjects(user_id: string) {
    const res = await fetch(`/api/subjects?user_id=${user_id}`)
    const data = await res.json()
    setSubjects(data)
  }

  useEffect(() => {
    loadUser()
  }, [])

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
            className="rounded-lg bg-slate-900 px-3 py-2 text-white hover:bg-slate-800">
            +
          </button>
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-100">
            ⚙️
          </button>
        </div>
      </header>

      {/* LOGIN */}
      {!userId && (
        <div className="mx-auto max-w-sm rounded-xl bg-white p-6 shadow">
          <input
            className="mb-3 w-full rounded border p-2"
            placeholder="Email"
            onChange={e => setEmail(e.target.value)}
          />
          <input
            className="mb-3 w-full rounded border p-2"
            type="password"
            placeholder="Senha"
            onChange={e => setPassword(e.target.value)}
          />
          <button
            className="w-full rounded bg-slate-900 py-2 text-white"
            onClick={handleLogin}
          >
            Entrar
          </button>
          <p className="mt-2 text-sm text-red-600">{message}</p>
        </div>
      )}

      {userId && (
        <>
          {/* CHARTS */}
          <section className="mb-8 grid gap-4 md:grid-cols-2">
            <div className="h-32 rounded-xl border border-dashed border-slate-300 bg-white" />
            <div className="h-32 rounded-xl border border-dashed border-slate-300 bg-white" />
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
        </>
      )}  
      <AddErrorModal
        isOpen={isAddErrorOpen}
        onClose={() => setIsAddErrorOpen(false)}
        onSuccess={() => {
          // por enquanto não faz nada
          // depois podemos atualizar gráficos
        }}
      />
    </main>
  )
}
