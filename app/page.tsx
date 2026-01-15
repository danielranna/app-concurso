"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Subject = {
  id: string
  name: string
}

export default function Home() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")

  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [newSubject, setNewSubject] = useState("")

  // 🔐 LOGIN
  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage("Login realizado com sucesso!")
      loadUser()
    }
  }

  async function handleSignup() {
    const { error } = await supabase.auth.signUp({
      email,
      password
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage("Usuário criado! Verifique o email.")
    }
  }

  // 👤 CARREGAR USUÁRIO LOGADO
  async function loadUser() {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (user) {
      setUserId(user.id)
      loadSubjects(user.id)
    }
  }

  // 📚 LISTAR MATÉRIAS
  async function loadSubjects(user_id: string) {
    const res = await fetch(`/api/subjects?user_id=${user_id}`)
    const data = await res.json()
    setSubjects(data)
  }

  // ➕ CRIAR MATÉRIA
  async function createSubject() {
    if (!newSubject || !userId) return

    await fetch("/api/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        name: newSubject
      })
    })

    setNewSubject("")
    loadSubjects(userId)
  }

  // 🔄 tenta recuperar sessão ao abrir a página
  useEffect(() => {
    loadUser()
  }, [])

  return (
    <main style={{ padding: 40 }}>
      <h1>🧠 Mapa de Correção de Erros</h1>

      {!userId && (
        <>
          <h2>🔐 Login</h2>

          <input
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          /><br /><br />

          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={e => setPassword(e.target.value)}
          /><br /><br />

          <button onClick={handleLogin}>Entrar</button>
          <button onClick={handleSignup} style={{ marginLeft: 10 }}>
            Criar conta
          </button>

          <p>{message}</p>
        </>
      )}

      {userId && (
        <>
          <h2>📚 Matérias</h2>

          <input
            placeholder="Nova matéria (ex: ICMS)"
            value={newSubject}
            onChange={e => setNewSubject(e.target.value)}
          />
          <button onClick={createSubject} style={{ marginLeft: 10 }}>
            Adicionar
          </button>

          <ul style={{ marginTop: 20 }}>
            {subjects.map(subject => (
              <li key={subject.id}>{subject.name}</li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
