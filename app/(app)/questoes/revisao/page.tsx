"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { todayDateString } from "@/lib/daily-wrong-attempts-utils"
import DailyWrongReviewList from "@/components/questions/DailyWrongReviewList"
import { Input } from "@/components/ui/input"
import { QuestoesPageHeader } from "@/components/questions/questoes-shell"

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
    return (
      <div className="flex justify-center py-16">
        <p className="text-sm text-slate-500">Carregando…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <QuestoesPageHeader
        title="Correções do dia"
        description="Questões que você errou — gabarito e link direto para o TEC."
        actions={
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium text-slate-500">Data</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-auto"
            />
          </label>
        }
      />

      <DailyWrongReviewList userId={userId} date={date} />
    </div>
  )
}
