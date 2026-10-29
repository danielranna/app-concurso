"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { toDateInputValue } from "@/lib/home-date"
import { supabase } from "@/lib/supabase"
import { beginWidgetDrag, endWidgetDrag, moveWidgetDrag, openWidgetLink, sendTestNotification, widgetRunningInShell } from "@/lib/widget-bridge"
import { widgetQuestionTopic } from "@/lib/widget-question-live"
import {
  attemptInPeriod,
  bumpQuestionStats,
  reconcileQuestionStats,
  type LiveAttempt,
} from "@/lib/widget-question-live"
import {
  WIDGET_PERIOD_LABELS,
  WIDGET_PERIODS,
  type WidgetPeriod,
  type WidgetSummary,
} from "@/lib/widget-types"

type Props = {
  userId: string
}

function periodSince(period: WidgetPeriod): string | null {
  if (period === "all") return null
  const start = new Date()
  if (period === "hoje") {
    start.setHours(0, 0, 0, 0)
  } else {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90
    start.setDate(start.getDate() - days)
  }
  return start.toISOString()
}

function localClock(): { today: string; now: string } {
  const current = new Date()
  const now = `${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}`
  return { today: toDateInputValue(current), now }
}

function TestNotificationButton() {
  const [note, setNote] = useState<string | null>(null)
  if (!widgetRunningInShell()) return null
  return (
    <div className="shrink-0">
      <button
        type="button"
        className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white"
        onClick={() => {
          setNote("Enviando…")
          void sendTestNotification()
            .then(() => setNote("Pedido enviado. Olhe o canto da tela."))
            .catch((err: unknown) => setNote(err instanceof Error ? err.message : "Não foi possível enviar."))
        }}
      >
        Testar notificação
      </button>
      {note && <p className="mt-1 text-[11px] text-slate-600">{note}</p>}
    </div>
  )
}

export default function WidgetBoard({ userId }: Props) {
  const [period, setPeriod] = useState<WidgetPeriod>("7d")
  const [data, setData] = useState<WidgetSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const lateRef = useRef<LiveAttempt[]>([])
  const seenRef = useRef(new Set<string>())
  const foldedRef = useRef(new Set<string>())

  const load = useCallback(
    async (nextPeriod: WidgetPeriod) => {
      const clock = localClock()
      const params = new URLSearchParams({
        user_id: userId,
        period: nextPeriod,
        today: clock.today,
        now: clock.now,
      })
      const since = periodSince(nextPeriod)
      if (since) params.set("since", since)
      const started = Date.now()
      const res = await fetch(`/api/widget/summary?${params}`)
      const body = await res.json()
      if (!res.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Erro ao carregar")
      }
      const summary = body as WidgetSummary
      const late = lateRef.current.filter((attempt) => attempt.receivedAt >= started)
      lateRef.current = []
      for (const attempt of late) foldedRef.current.add(attempt.id)
      summary.stats = reconcileQuestionStats(summary.stats, late)
      setData(summary)
      setError(null)
    },
    [userId]
  )

  useEffect(() => {
    let cancelled = false
    let running = false
    async function run() {
      if (running) return
      running = true
      try {
        await load(period)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar")
      } finally {
        running = false
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

  useEffect(() => {
    const since = periodSince(period)
    const channel = supabase.channel(widgetQuestionTopic(userId))
    channel.on("broadcast", { event: "attempt" }, (message) => {
      const payload = message.payload as {
        id?: string
        is_correct?: boolean
        duration_ms?: number
        created_at?: string
      }
      if (!payload?.id || typeof payload.created_at !== "string") return
      if (seenRef.current.has(payload.id)) return
      if (!attemptInPeriod(payload.created_at, since)) return
      const attempt: LiveAttempt = {
        id: payload.id,
        isCorrect: Boolean(payload.is_correct),
        durationMs: Math.max(0, Number(payload.duration_ms) || 0),
        createdAt: payload.created_at,
        receivedAt: Date.now(),
      }
      seenRef.current.add(attempt.id)
      lateRef.current.push(attempt)
      setData((current) => {
        if (!current || foldedRef.current.has(attempt.id)) return current
        return { ...current, stats: bumpQuestionStats(current.stats, attempt) }
      })
    })
    void channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, period])

  const pieData = useMemo(() => {
    const summary = data?.stats.summary
    if (!summary?.total_attempts) return []
    return [
      { name: "Acertos", value: summary.correct, color: "#22c55e" },
      { name: "Erros", value: summary.wrong, color: "#ef4444" },
    ]
  }, [data])

  const upcomingKey = (data?.agenda.upcoming ?? []).map((event) => event.id).join("|")
  const upcomingCount = data?.agenda.upcoming.length ?? 0
  const [eventIndex, setEventIndex] = useState(0)
  const [carouselEpoch, setCarouselEpoch] = useState(0)

  useEffect(() => {
    setEventIndex(0)
  }, [upcomingKey])

  useEffect(() => {
    if (upcomingCount < 2) return
    const id = window.setInterval(() => {
      setEventIndex((current) => (current + 1) % upcomingCount)
    }, 5000)
    return () => window.clearInterval(id)
  }, [upcomingCount, carouselEpoch, upcomingKey])

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
      <div className="flex h-screen items-center justify-center gap-2 text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando…
      </div>
    )
  }

  const agenda = data?.agenda
  const study = data?.study
  const stats = data?.stats

  return (
    <main
      className="flex h-screen flex-col gap-2 overflow-y-auto rounded-2xl border border-white/70 p-2.5 text-slate-900 shadow-xl backdrop-blur-2xl"
      style={{ backgroundColor: "rgba(255,255,255,0.68)" }}
    >
      <header
        className="flex shrink-0 cursor-grab select-none items-baseline justify-between touch-none active:cursor-grabbing"
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
        <p className="text-sm font-semibold tabular-nums">{agenda?.date_label ?? "—"}</p>
        <p className="text-xs text-slate-500">{agenda?.weekday_label ?? ""}</p>
      </header>

      <TestNotificationButton />

      {error && (
        <p className="shrink-0 rounded-lg bg-red-50/90 px-2.5 py-1.5 text-xs text-red-700">{error}</p>
      )}

      <section className="rounded-xl border border-white/90 bg-white/85 p-2.5 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Agora</p>
        {agenda?.now ? (
          <div className="mt-1">
            {agenda.now.status === "next" && (
              <p className="text-[11px] font-medium text-teal-700">A seguir</p>
            )}
            <p className="text-sm font-semibold leading-snug">{agenda.now.title}</p>
            <p className="text-xs tabular-nums text-slate-500">
              {agenda.now.start_time} – {agenda.now.end_time}
            </p>
            {agenda.now.plan_text && (
              <p className="mt-1 line-clamp-2 text-xs text-slate-600">{agenda.now.plan_text}</p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Nada na agenda agora.</p>
        )}
      </section>

      <section className="rounded-xl border border-white/90 bg-white/85 p-2.5 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Próximos eventos
        </p>
        {agenda && agenda.upcoming.length > 0 ? (
          <div className="mt-1.5 flex items-center gap-1">
            <button
              type="button"
              aria-label="Evento anterior"
              disabled={agenda.upcoming.length < 2}
              onClick={() => {
                const total = agenda.upcoming.length
                setCarouselEpoch((value) => value + 1)
                setEventIndex((current) => (current - 1 + total) % total)
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1 overflow-hidden">
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${(eventIndex % agenda.upcoming.length) * 100}%)` }}
              >
                {agenda.upcoming.map((event) => (
                  <div key={event.id} className="w-full shrink-0">
                    <p className="flex items-center gap-1.5 truncate text-xs font-medium">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: event.color }}
                      />
                      {event.title}
                    </p>
                    <p className="mt-0.5 pl-3 text-[11px] text-slate-500">
                      {event.date_label}
                      {event.start_time ? ` · ${event.start_time}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              aria-label="Próximo evento"
              disabled={agenda.upcoming.length < 2}
              onClick={() => {
                const total = agenda.upcoming.length
                setCarouselEpoch((value) => value + 1)
                setEventIndex((current) => (current + 1) % total)
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Nenhum evento a partir de hoje.</p>
        )}
      </section>

      <section className="rounded-xl border border-white/90 bg-white/85 p-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold tabular-nums leading-none">{study?.flashcards_due ?? 0}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">flashcards pendentes</p>
          </div>
          <button
            type="button"
            title="Abrir TEC"
            onClick={() => void openWidgetLink(data?.links.tec ?? "https://www.tecconcursos.com.br")}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/90 bg-white/70 text-xs font-semibold text-slate-700 hover:bg-white"
          >
            T
          </button>
          <button
            type="button"
            title="Abrir o app"
            onClick={() => void openWidgetLink(`${window.location.origin}/`)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/90 bg-white/70 text-slate-700 hover:bg-white"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Fila de estudo</p>
          {study?.cycle ? (
            <div className="mt-1">
              <p className="truncate text-xs font-semibold">
                {study.cycle.subject ??
                  (study.cycle.total > 0 && study.cycle.completed === study.cycle.total
                    ? "Ciclo concluído"
                    : "Matéria")}
              </p>
              {study.cycle.detail && (
                <p className="truncate text-[11px] text-slate-500">{study.cycle.detail}</p>
              )}
              <div className="mt-1.5 flex items-center gap-2">
                <Progress value={study.cycle.progress_pct} className="flex-1" />
                <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                  {study.cycle.completed} de {study.cycle.total}
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Nenhum ciclo ativo.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/90 bg-white/85 p-2.5 shadow-sm">
        <div className="flex gap-1">
          {WIDGET_PERIODS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              className={`flex-1 rounded-md px-0.5 py-1 text-[10px] ${
                period === item
                  ? "bg-slate-900 font-medium text-white"
                  : "text-slate-600 hover:bg-white/70"
              }`}
            >
              {WIDGET_PERIOD_LABELS[item]}
            </button>
          ))}
        </div>

        {stats && stats.summary.total_attempts > 0 ? (
          <div className="mt-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div>
                <p className="text-[11px] text-slate-500">Questões</p>
                <p className="text-lg font-bold tabular-nums leading-none">{stats.summary.total_attempts}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Matérias</p>
                <p className="text-lg font-bold tabular-nums leading-none">{stats.summary.subject_count}</p>
              </div>
              <div>
                <p className="text-[11px] text-green-700">Acertos</p>
                <p className="text-lg font-bold tabular-nums leading-none text-green-600">
                  {stats.summary.correct}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-red-600">Erros</p>
                <p className="text-lg font-bold tabular-nums leading-none text-red-600">
                  {stats.summary.wrong}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2 border-t border-slate-200/80 pt-2">
              <div>
                <p className="text-[11px] text-slate-500">Horas estudadas</p>
                <p className="text-base font-bold tabular-nums text-indigo-700">{stats.study_hours_label}</p>
                <p className="text-[10px] leading-snug text-slate-400">
                  Tempo nas questões deste período
                </p>
              </div>
              <div className="relative h-16 w-16 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      innerRadius={20}
                      outerRadius={28}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold">{stats.summary.correct_pct}%</span>
                </div>
              </div>
            </div>
            <div className="mt-1">
              <p className="text-[11px] font-medium text-slate-500">Por matéria</p>
              {radarData.length >= 3 ? (
                <ResponsiveContainer width="100%" height={128}>
                  <RadarChart data={radarData} cx="50%" cy="52%" outerRadius="62%">
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
                    <Radar name="Acerto" dataKey="pct" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.35} />
                    <Tooltip
                      formatter={(value) => [`${value ?? 0}%`, "Acerto"]}
                      labelFormatter={(_, payload) =>
                        (payload?.[0]?.payload as { fullName?: string } | undefined)?.fullName ?? ""
                      }
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-3 text-center text-[11px] text-slate-400">
                  Resolva questões em pelo menos 3 matérias para ver o radar.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-xs text-slate-500">Nenhuma questão respondida neste período.</p>
            {stats && (
              <p className="mt-2 text-xs text-slate-600">
                Horas neste período{" "}
                <span className="font-semibold tabular-nums text-indigo-700">{stats.study_hours_label}</span>
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
