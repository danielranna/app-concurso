"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

export default function Home() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")

  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage("Login realizado com sucesso!")
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

  return (
    <main style={{ padding: 40 }}>
      <h1>🔐 Login Supabase</h1>

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
    </main>
  )
}
