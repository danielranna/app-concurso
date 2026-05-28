"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Calendar, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react"
import type { AgendaEvent } from "@/lib/agenda-types"
import HomeAgendaDay from "@/components/home/HomeAgendaDay"
import {
  endOfMonth,
  endOfWeek,
  formatDayMonth,
  formatWeekdayShort,
  parseDateInput,
  startOfMonth,
  startOfWeek,
  toDateInputValue,
} from "@/lib/home-date"

type AgendaTab = "day" | "week" | "month"

type Props = {
  userId: string
}

const TABS: { id: AgendaTab; label: string }[] = [
  { id: "day", label: "Dia" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mês" },
]

export default function HomeAgenda({ userId }: Props) {
  const [tab, setTab] = useState<AgendaTab>("day")
  const [anchor, setAnchor] = useState(() => new Date())
  const [events, setEvents] = useState<AgendaEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dayStr = toDateInputValue(anchor)
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor])
  const weekEnd = useMemo(() => endOfWeek(anchor), [anchor])
  const monthStart = useMemo(() => startOfMonth(anchor), [anchor])
  const monthEnd = useMemo(() => endOfMonth(anchor), [anchor])

  const weekFromStr = useMemo(() => toDateInputValue(weekStart), [weekStart])
  const weekToStr = useMemo(() => toDateInputValue(weekEnd), [weekEnd])
  const monthFromStr = useMemo(() => toDateInputValue(monthStart), [monthStart])
  const monthToStr = useMemo(() => toDateInputValue(monthEnd), [monthEnd])

  /** Chave estável — evita loop por objetos Date novos a cada render. */
  const fetchKey = useMemo(() => {
    if (tab === "day") return null
    if (tab === "week") return `week:${weekFromStr}:${weekToStr}`
    return `month:${monthFromStr}:${monthToStr}`
  }, [tab, weekFromStr, weekToStr, monthFromStr, monthToStr])

  const reload = useCallback(async () => {
    setError(null)
    if (tab === "day") return
    const from = tab === "week" ? weekFromStr : monthFromStr
    const to = tab === "week" ? weekToStr : monthToStr
    const res = await fetch(
      `/api/agenda/events?user_id=${userId}&from=${from}&to=${to}&_=${Date.now()}`
    )
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Erro ao carregar eventos")
      return
    }
    setEvents(data.events ?? [])
  }, [userId, tab, weekFromStr, weekToStr, monthFromStr, monthToStr])

  useEffect(() => {
    if (!fetchKey) return
    let cancelled = false
    async function run() {
      setLoading(true)
      await reload()
      if (!cancelled) setLoading(false)
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey])

  const weekDays = useMemo(() => {
    const days: Date[] = []
    const d = new Date(weekStart)
    for (let i = 0; i < 7; i++) {
      days.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
    return days
  }, [weekStart])

  const monthGrid = useMemo(() => {
    const gridStart = new Date(monthStart)
    const pad = gridStart.getDay() === 0 ? 6 : gridStart.getDay() - 1
    gridStart.setDate(gridStart.getDate() - pad)
    const cells: Date[] = []
    for (let i = 0; i < 42; i++) {
      const c = new Date(gridStart)
      c.setDate(gridStart.getDate() + i)
      cells.push(c)
    }
    return cells
  }, [monthStart])

  function shiftAnchor(delta: number) {
    const d = new Date(anchor)
    if (tab === "day") d.setDate(d.getDate() + delta)
    else if (tab === "week") d.setDate(d.getDate() + delta * 7)
    else d.setMonth(d.getMonth() + delta)
    setAnchor(d)
  }

  async function addEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const title = String(fd.get("title")).trim()
    const event_date = String(fd.get("event_date"))
    if (!title || !event_date) return

    const res = await fetch("/api/agenda/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        title,
        event_date,
        notes: String(fd.get("notes") || "").trim() || null,
      }),
    })
    if (res.ok) {
      e.currentTarget.reset()
      await reload()
    }
  }

  async function removeEvent(id: string) {
    await fetch(`/api/agenda/events?user_id=${userId}&id=${id}`, { method: "DELETE" })
    await reload()
  }

  function eventsForDay(d: Date) {
    const key = toDateInputValue(d)
    return events.filter((ev) => {
      const end = ev.end_date ?? ev.event_date
      return key >= ev.event_date && key <= end
    })
  }

  const headerLabel =
    tab === "day"
      ? anchor.toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      : tab === "week"
        ? `${formatDayMonth(weekStart)} – ${formatDayMonth(weekEnd)}`
        : anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Agenda</h2>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftAnchor(-1)}
          className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
          aria-label="Anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-medium capitalize text-slate-800">{headerLabel}</p>
        <button
          type="button"
          onClick={() => shiftAnchor(1)}
          className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
          aria-label="Próximo"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {error && tab !== "day" && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      )}

      {tab === "day" ? (
        <HomeAgendaDay userId={userId} anchor={anchor} onAnchorChange={setAnchor} />
      ) : loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Carregando…</p>
      ) : tab === "week" ? (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-7">
            {weekDays.map((d) => {
              const dayEvents = eventsForDay(d)
              const isToday = toDateInputValue(d) === toDateInputValue(new Date())
              return (
                <div
                  key={d.toISOString()}
                  className={`min-h-[100px] rounded-lg border p-2 ${
                    isToday ? "border-blue-300 bg-blue-50/50" : "border-slate-100 bg-slate-50/50"
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-600">
                    {formatWeekdayShort(d)} {d.getDate()}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {dayEvents.map((ev) => (
                      <li
                        key={ev.id}
                        className="rounded px-1 py-0.5 text-xs text-white"
                        style={{ backgroundColor: ev.color }}
                        title={ev.title}
                      >
                        <span className="line-clamp-2">{ev.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          <form onSubmit={addEvent} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Data
              <input
                name="event_date"
                type="date"
                required
                defaultValue={dayStr}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="min-w-[180px] flex-1 flex-col gap-1 text-xs text-slate-600 sm:flex">
              Evento
              <input
                name="title"
                type="text"
                required
                placeholder="Ex.: Último dia inscrição — concurso X"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              Evento
            </button>
          </form>

          {events.length > 0 && (
            <ul className="space-y-2 border-t border-slate-100 pt-3">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium text-slate-800">{ev.title}</span>
                    <span className="ml-2 text-slate-500">
                      {formatDayMonth(parseDateInput(ev.event_date))}
                      {ev.end_date && ev.end_date !== ev.event_date
                        ? ` – ${formatDayMonth(parseDateInput(ev.end_date))}`
                        : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeEvent(ev.id)}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
            {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthGrid.map((d) => {
              const inMonth = d.getMonth() === anchor.getMonth()
              const dayEvents = eventsForDay(d)
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => {
                    setAnchor(d)
                    setTab("day")
                  }}
                  className={`min-h-[72px] rounded-lg border p-1 text-left text-xs ${
                    inMonth
                      ? "border-slate-100 bg-white hover:border-blue-200"
                      : "border-transparent bg-slate-50/50 text-slate-400"
                  }`}
                >
                  <span className="font-medium">{d.getDate()}</span>
                  {dayEvents.slice(0, 2).map((ev) => (
                    <span
                      key={ev.id}
                      className="mt-0.5 block truncate rounded px-0.5 text-[10px] text-white"
                      style={{ backgroundColor: ev.color }}
                    >
                      {ev.title}
                    </span>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="text-[10px] text-slate-500">+{dayEvents.length - 2}</span>
                  )}
                </button>
              )
            })}
          </div>

          <form onSubmit={addEvent} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Data
              <input
                name="event_date"
                type="date"
                required
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="min-w-[180px] flex-1 flex-col gap-1 text-xs text-slate-600 sm:flex">
              Evento
              <input
                name="title"
                type="text"
                required
                placeholder="Prazo, prova, inscrição…"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              Evento
            </button>
          </form>
        </div>
      )}
    </section>
  )
}
