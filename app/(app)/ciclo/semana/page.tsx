"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, ExternalLink, Loader2, PenLine } from "lucide-react"
import type { StudyCycle } from "@/lib/study-cycle-types"

const BLOCK_TYPE_LABELS: Record<string, string> = {
  questions: "Questões",
  flashcards: "Flashcards",
  read: "Leitura",
  error_review: "Erros",
}

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
          Planejar ciclo manualmente
        </Link>
      </div>
    )
  }

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
            {cycle.total_days} dias · dia atual {cycle.current_day_index + 1}
            {cycleEnabled ? " · ciclo ativo" : " · pausado"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/ciclo/planejar"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <PenLine className="h-3.5 w-3.5" />
            Editar
          </Link>
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
      </div>

      <div className="space-y-4">
        {cycle.days.map((day) => {
          const isCurrent = day.day_index === cycle.current_day_index
          const blocks = day.blocks?.length
            ? day.blocks
            : cycle.cycle_blocks.filter((b) => b.day_index === day.day_index)

          return (
            <section
              key={day.day_index}
              className={`rounded-xl border p-4 ${
                isCurrent
                  ? "border-teal-300 bg-teal-50/40"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-900">
                  Dia {day.day_index + 1}
                </h2>
                {isCurrent && (
                  <span className="rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                    Hoje
                  </span>
                )}
              </div>

              {blocks.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Sem blocos</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {blocks
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((b, i) => (
                      <li
                        key={b.id ?? i}
                        className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm border border-slate-100"
                      >
                        <span className="font-medium text-slate-800">
                          {b.label ||
                            b.content_node_name ||
                            b.subject_name ||
                            "Bloco"}
                        </span>
                        <span className="text-xs text-slate-500">
                          {BLOCK_TYPE_LABELS[b.block_type] ?? b.block_type}
                          {b.params.question_count
                            ? ` · ${b.params.question_count} questões`
                            : ""}
                          {b.subject_name ? ` · ${b.subject_name}` : ""}
                        </span>
                      </li>
                    ))}
                </ol>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
