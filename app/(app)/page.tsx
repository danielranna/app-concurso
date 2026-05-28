"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import HomeAgenda from "@/components/home/HomeAgenda"
import HomeFlashcardWidget from "@/components/home/HomeFlashcardWidget"
import HomeStatsSummary from "@/components/home/HomeStatsSummary"
import HomeWrongQuestion from "@/components/home/HomeWrongQuestion"

export default function HomePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
    })
  }, [router])

  if (!userId) {
    return <p className="p-8 text-slate-500">Carregando…</p>
  }

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Início</h1>
        <p className="mt-1 text-sm text-slate-500">
          Agenda, revisão rápida e visão geral do seu estudo.
        </p>
      </header>

      <HomeAgenda userId={userId} />

      <div className="grid gap-6 lg:grid-cols-2">
        <HomeFlashcardWidget userId={userId} />
        <HomeWrongQuestion userId={userId} />
      </div>

      <HomeStatsSummary userId={userId} />
    </main>
  )
}
