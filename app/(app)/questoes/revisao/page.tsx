"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { todayDateString } from "@/lib/daily-wrong-attempts-utils"
import DailyWrongReviewList from "@/components/questions/DailyWrongReviewList"

export default function QuestoesRevisaoPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [date, setDate] = useState(() => todayDateString())

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
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-4">
        <Link
          href="/questoes"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar às questões
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Correções do dia</h1>
            <p className="mt-1 text-sm text-slate-600">
              Questões que você errou — gabarito e link direto para o TEC.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">Data</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-slate-800"
            />
          </label>
        </div>
      </header>

      <DailyWrongReviewList userId={userId} date={date} />
    </div>
  )
}
