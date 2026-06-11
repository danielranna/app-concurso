"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Loader2, ExternalLink } from "lucide-react"
import type { StudyCycle } from "@/lib/study-cycle-types"
import { WEEKDAY_LABELS } from "@/lib/study-cycle-planner"

export default function CicloSemanaPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [cycle, setCycle] = useState<StudyCycle | null>(null)
  const [cycleEnabled, setCycleEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback((uid: string) => {
    setLoading(true)
    return fetch(`/api/ciclo?user_id=${uid}`)
      .then((r) => r.json())
      .then((d) => {
        setCycle(d.cycle ?? null)
        setCycleEnabled(d.preferences?.cycle_enabled ?? false)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      load(user.id)
    })
  }, [router, load])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    )
  }

  if (!cycle?.days?.length) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <p className="text-slate-600">Nenhum ciclo planejado ainda.</p>
        <Link
          href="/ciclo/planejar"
          className="inline-block text-teal-700 underline"
        >
          Planejar ciclo
        </Link>
      </div>
    )
  }

  const subjectName = (id: string) =>
    cycle.subjects.find((s) => s.subject_id === id)?.subject_name ?? id

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/ciclo"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Grade do ciclo</h1>
          <p className="mt-1 text-sm text-slate-600">
            {cycle.total_days} dias · dia atual{" "}
            {cycle.current_day_index + 1}
            {cycleEnabled ? " · ciclo ativo" : " · pausado (consultoria)"}
          </p>
        </div>
        {cycleEnabled && (
          <Link
            href="/coach/hoje"
            className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Plano de hoje
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Dia</th>
              <th className="px-4 py-3">Semana</th>
              <th className="px-4 py-3">Matérias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cycle.days.map((day) => {
              const isCurrent = day.day_index === cycle.current_day_index
              return (
                <tr
                  key={day.day_index}
                  className={isCurrent ? "bg-teal-50/60" : undefined}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {day.day_index + 1}
                    {isCurrent && (
                      <span className="ml-2 rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                        Hoje
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {day.weekday != null ? WEEKDAY_LABELS[day.weekday] : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {day.subject_ids.map(subjectName).join(" · ")}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
