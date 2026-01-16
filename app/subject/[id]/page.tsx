"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Subject = {
  id: string
  name: string
}

export default function SubjectPage() {
  const params = useParams()
  const router = useRouter()

  const subjectId = params.id as string

  const [userId, setUserId] = useState<string | null>(null)
  const [subject, setSubject] = useState<Subject | null>(null)
  const [loading, setLoading] = useState(true)

  // 🔐 carrega usuário
  async function loadUser() {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      router.push("/") // volta pro login
      return
    }

    setUserId(user.id)
    loadSubject(user.id)
  }

  // 📚 carrega matéria
  async function loadSubject(user_id: string) {
    const res = await fetch(
      `/api/subjects?user_id=${user_id}&subject_id=${subjectId}`
    )

    const data = await res.json()
    setSubject(data)
    setLoading(false)
  }

  useEffect(() => {
    loadUser()
  }, [])

  if (loading) {
    return <p style={{ padding: 40 }}>Carregando matéria...</p>
  }

  if (!subject) {
    return <p style={{ padding: 40 }}>Matéria não encontrada.</p>
  }

  return (
    <main style={{ padding: 40 }}>
      <button onClick={() => router.push("/")}>⬅ Voltar</button>

      <h1 style={{ marginTop: 20 }}>{subject.name}</h1>

      <p style={{ marginTop: 10, color: "#666" }}>
        Página da matéria (erros e filtros virão aqui)
      </p>
    </main>
  )
}
