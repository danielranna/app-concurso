"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import HomeAgenda from "@/components/home/HomeAgenda"

export default function AgendaPage() {
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
    <main className="min-h-full p-4 sm:p-6">
      <HomeAgenda userId={userId} fullPage />
    </main>
  )
}
