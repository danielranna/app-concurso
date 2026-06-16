"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Download, ExternalLink, Loader2, PenLine } from "lucide-react"
import type { StudyCycle } from "@/lib/study-cycle-types"
import type { QueueState } from "@/lib/study-cycle-queue"
import WeekGrid from "@/components/ciclo/WeekGrid"
import { enrichCycleDays } from "@/lib/study-cycle-week-utils"
import { downloadCyclePdf } from "@/lib/cycle-pdf-download"
import { useCyclePlanId } from "@/lib/use-cycle-plan-id"
import { withCycleId } from "@/lib/cycle-plan-context"

export default function CicloSemanaPage() {
  const router = useRouter()
  const { cycleId } = useCyclePlanId()
  const [userId, setUserId] = useState<string | null>(null)
  const [cycle, setCycle] = useState<StudyCycle | null>(null)
  const [cycleEnabled, setCycleEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"grid" | "list">("grid")
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [queue, setQueue] = useState<QueueState | null>(null)

  const load = useCallback((uid: string, cid?: string | null) => {
    setLoading(true)
    const q = cid ? `&cycle_id=${encodeURIComponent(cid)}` : ""
    return fetch(`/api/ciclo?user_id=${uid}${q}`)
      .then((r) => r.json())
      .then((d) => {
        setCycle(d.cycle ?? null)
        setCycleEnabled(d.preferences?.cycle_enabled ?? false)
        const hasBlocks = (d.cycle?.cycle_blocks?.length ?? 0) > 0
        if (hasBlocks) {
          return fetch(`/api/ciclo/queue?user_id=${uid}`)
            .then((r) => r.json())
            .then((qd) => {
              setQueue(qd.queue ?? null)
              if (qd.cycle) setCycle(qd.cycle)
            })
        }
        setQueue(null)
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
      load(user.id, cycleId)
    })
  }, [router, load, cycleId])

  useEffect(() => {
    if (userId && cycleId) load(userId, cycleId)
  }, [userId, cycleId, load])

  async function downloadPdf() {
    if (!userId) return
    setDownloadingPdf(true)
    try {
      await downloadCyclePdf(userId)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao baixar PDF")
    } finally {
      setDownloadingPdf(false)
    }
  }

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

  const enrichedCycle: StudyCycle = enrichCycleDays(cycle)

  const completedBlockIds = new Set(
    queue?.completed.map((b) => b.id).filter(Boolean) as string[]
  )
  const currentBlockId = queue?.current?.id ?? null

  return (
    <div className="mx-auto max-w-6xl space-y-6">
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
            {cycle.planning_mode === "deadline_driven" && cycle.target_weeks
              ? ` · prazo ${cycle.target_weeks} sem`
              : ""}
            {cycleEnabled ? " · ciclo ativo" : " · pausado"}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`rounded px-2 py-1 ${view === "grid" ? "bg-slate-100 font-medium" : ""}`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`rounded px-2 py-1 ${view === "list" ? "bg-slate-100 font-medium" : ""}`}
            >
              Lista
            </button>
          </div>
          <Link
            href="/ciclo/planejar"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <PenLine className="h-3.5 w-3.5" />
            Editar
          </Link>
          <button
            type="button"
            disabled={downloadingPdf}
            onClick={downloadPdf}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {downloadingPdf ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Baixar PDF
          </button>
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

      {view === "grid" ? (
        <WeekGrid
          cycle={enrichedCycle}
          completedBlockIds={completedBlockIds}
          currentBlockId={currentBlockId}
        />
      ) : (
        <div className="space-y-4">
          {enrichedCycle.days.map((day) => {
            const isCurrent = day.day_index === cycle.current_day_index
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
                <ol className="mt-3 space-y-2">
                  {day.blocks.map((b, i) => {
                    const done = b.id != null && completedBlockIds.has(b.id)
                    const isNow = b.id != null && b.id === currentBlockId
                    return (
                      <li
                        key={b.id ?? i}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          done
                            ? "border-emerald-200 bg-emerald-50/50 line-through opacity-70"
                            : isNow
                              ? "border-teal-300 bg-teal-50 ring-1 ring-teal-400"
                              : "border-slate-100 bg-white/80"
                        }`}
                      >
                        <span className="font-medium">{b.label}</span>
                        {b.subject_name && (
                          <span className="ml-2 text-xs text-slate-500">
                            {b.subject_name}
                          </span>
                        )}
                        {done && (
                          <span className="ml-2 text-xs text-emerald-700">
                            Concluído
                          </span>
                        )}
                        {isNow && !done && (
                          <span className="ml-2 text-xs font-medium text-teal-700">
                            Agora
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
