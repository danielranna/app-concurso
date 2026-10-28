"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

function afterLoginPath(): string {
  if (typeof window === "undefined") return "/"
  const next = new URLSearchParams(window.location.search).get("next")
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/"
  return next
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.push(afterLoginPath())
      }
    })
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage("")

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setMessage(error.message)
    } else {
      router.push(afterLoginPath())
    }

    setLoading(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-semibold text-slate-800">
          Mapa de correção de erros
        </h1>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-0"
              placeholder="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <input
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-0"
              type="password"
              placeholder="Senha"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

          {message && (
            <p className="text-center text-sm text-red-600">{message}</p>
          )}

          <div className="pt-2 text-center text-sm text-slate-600">
            Não tem uma conta?{" "}
            <Link href="/register" className="font-medium text-slate-900 hover:underline">
              Criar conta
            </Link>
          </div>
        </form>
      </div>
    </main>
  )
}
