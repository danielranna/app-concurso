"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Tooltip,
} from "recharts"
import { Check, Loader2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { toDateInputValue } from "@/lib/home-date"
import { beginWidgetDrag, endWidgetDrag, moveWidgetDrag, openWidgetLink } from "@/lib/widget-bridge"
import {
  WIDGET_PERIOD_LABELS,
  WIDGET_PERIODS,
  type WidgetPeriod,
  type WidgetSummary,
} from "@/lib/widget-types"

type Props = {
  userId: string
}

function localClock(): { today: string; now: string } {
  const current = new Date()
  const now = `${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}`
  return { today: toDateInputValue(current), now }
}

export default function WidgetBoard({ userId }: Props) {
  const [period, setPeriod] = useState<WidgetPeriod>("7d")
  const [data, setData] = useState<WidgetSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)

  const load = useCallback(
    async (nextPeriod: WidgetPeriod) => {
      const clock = localClock()
      const params = new URLSearchParams({
        user_id: userId,
        period: nextPeriod,
        today: clock.today,
        now: clock.now,
      })
      const res = await fetch(`/api/widget/summary?${params}`)
      const body = await res.json()
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Erro ao carregar")
      }
      setData(body as WidgetSummary)
      setError(null)
    },
    [userId]
  )

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        await load(period)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar")
      } finally {
        if (!cancelled) setInitialLoading(false)
      }
    }
    void run()
    const id = window.setInterval(() => {
      void run()
    }, 60_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") void run()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [load, period])

  const pieData = useMemo(() => {
    const summary = data?.stats.summary
    if (!summary?.total_attempts) return []
    return [
      { name: "Acertos", value: summary.correct, color: "#22c55e" },
      { name: "Erros", value: summary.wrong, color: "#ef4444" },
    ]
  }, [data])

  const radarData = useMemo(
    () =>
      (data?.stats.by_subject ?? []).map((row) => ({
        subject: row.short_label,
        pct: row.correct_pct,
        fullName: row.name,
      })),
    [data]
  )

  if (initialLoading && !data) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 bg-slate-100 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando…
      </div>
    )
  }

  const agenda = data?.agenda
  const study = data?.study
  const stats = data?.stats

  return (
    <main className="flex h-screen flex-col gap-3 overflow-hidden bg-slate-100 p-3 text-slate-900">
      <header
        className="flex shrink-0 cursor-grab select-none items-baseline justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 touch-none active:cursor-grabbing"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          beginWidgetDrag(event.screenX, event.screenY)
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          moveWidgetDrag(event.screenX, event.screenY)
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          endWidgetDrag()
        }}
      >
        <p className="text-lg font-semibold tabular-nums">{agenda?.date_label ?? "—"}</p>
        <p className="text-sm text-slate-500">{agenda?.weekday_label ?? ""}</p>
      </header>

      {error && (
        <p className="shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <section className="grid min-h-0 shrink-0 grid-cols-[1.3fr_0.9fr] gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Agora</p>
          {agenda?.now ? (
            <div className="mt-2">
              {agenda.now.status === "next" && (
                <p className="text-xs font-medium text-teal-700">A seguir</p>
              )}
              <p className="text-lg font-semibold leading-snug">{agenda.now.title}</p>
              <p className="mt-1 text-sm tabular-nums text-slate-500">
                {agenda.now.start_time} – {agenda.now.end_time}
              </p>
              {agenda.now.plan_text && (
                <p className="mt-2 line-clamp-3 text-sm text-slate-600">{agenda.now.plan_text}</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Nada na agenda agora.</p>
          )}
        </div>

        <div className="flex max-h-40 flex-col rounded-xl border border-slate-200 bg-white p-4">
          <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">
            Próximos eventos
          </p>
          {agenda && agenda.upcoming.length > 0 ? (
            <ol className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {agenda.upcoming.map((event, index) => (
                <li key={event.id} className="flex items-start gap-2 text-sm">
                  <span className="w-4 shrink-0 tabular-nums text-slate-400">{index + 1}.</span>
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: event.color }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{event.title}</span>
                    <span className="text-xs text-slate-500">
                      {event.date_label}
                      {event.start_time ? ` · ${event.start_time}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Nenhum evento a partir de hoje.</p>
          )}
        </div>
      </section>

      <section className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="w-28">
          <p className="text-3xl font-bold tabular-nums leading-none">
            {study?.flashcards_due ?? 0}
          </p>
          <p className="mt-1 text-xs leading-snug text-slate-500">flashcards pendentes</p>
        </div>

        <div className="min-w-0 border-l border-slate-100 pl-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Fila de estudo
          </p>
          {study?.cycle ? (
            <div className="mt-1">
              <p className="truncate text-sm font-semibold">
                {study.cycle.subject ?? (study.cycle.total > 0 && study.cycle.completed === study.cycle.total
                  ? "Ciclo concluído"
                  : "Matéria")}
              </p>
              {study.cycle.detail && (
                <p className="truncate text-xs text-slate-500">{study.cycle.detail}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <Progress value={study.cycle.progress_pct} className="flex-1" />
                <span className="shrink-0 text-xs tabular-nums text-slate-500">
                  {study.cycle.completed} de {study.cycle.total}
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Nenhum ciclo ativo.</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            title="Abrir TEC"
            onClick={() => void openWidgetLink(data?.links.tec ?? "https://www.tecconcursos.com.br")}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            T
          </button>
          <button
            type="button"
            title="Abrir o app"
            onClick={() => void openWidgetLink(`${window.location.origin}/`)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Check className="h-5 w-5" />
          </button>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex shrink-0 gap-1">
          {WIDGET_PERIODS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                period === item
                  ? "bg-slate-900 font-medium text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {WIDGET_PERIOD_LABELS[item]}
            </button>
          ))}
        </div>

        {stats && stats.summary.total_attempts > 0 ? (
          <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 min-[800px]:grid-cols-[minmax(0,1fr)_168px_minmax(0,1.15fr)]">
            <div className="grid grid-cols-2 content-start gap-3">
              <div>
                <p className="text-xs text-slate-500">Questões resolvidas</p>
                <p className="text-2xl font-bold tabular-nums">{stats.summary.total_attempts}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total de matérias</p>
                <p className="text-2xl font-bold tabular-nums">{stats.summary.subject_count}</p>
              </div>
              <div>
                <p className="text-xs text-green-700">Acertos</p>
                <p className="text-2xl font-bold tabular-nums text-green-600">{stats.summary.correct}</p>
              </div>
              <div>
                <p className="text-xs text-red-600">Erros</p>
                <p className="text-2xl font-bold tabular-nums text-red-600">{stats.summary.wrong}</p>
              </div>
              <div className="col-span-2 border-t border-slate-100 pt-2">
                <p className="text-xs text-slate-500">Horas estudadas</p>
                <p className="text-xl font-bold tabular-nums text-indigo-700">
                  {stats.study_hours_label}
                </p>
                <p className="text-xs text-slate-400">
                  Total dos cronômetros de cadernos e sessões
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center">
              <p className="mb-1 text-xs font-medium text-slate-600">Taxa de acerto</p>
              <div className="relative h-36 w-36">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      innerRadius={44}
                      outerRadius={60}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold">{stats.summary.correct_pct}%</span>
                </div>
              </div>
            </div>

            <div className="min-h-[160px] min-w-0">
              <p className="mb-1 text-xs font-medium text-slate-600">Por matéria (% acerto)</p>
              {radarData.length >= 3 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="68%">
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                    <Radar
                      name="Acerto"
                      dataKey="pct"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.35}
                    />
                    <Tooltip
                      formatter={(value) => [`${value ?? 0}%`, "Acerto"]}
                      labelFormatter={(_, payload) =>
                        (payload?.[0]?.payload as { fullName?: string } | undefined)?.fullName ?? ""
                      }
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">
                  Resolva questões em pelo menos 3 matérias para ver o radar.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-500">Nenhuma questão respondida neste período.</p>
            {stats && (
              <p className="mt-3 text-sm text-slate-600">
                Horas estudadas{" "}
                <span className="font-semibold tabular-nums text-indigo-700">
                  {stats.study_hours_label}
                </span>
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
