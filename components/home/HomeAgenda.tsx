"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import type { AgendaEvent, AgendaProjectedDay, AgendaRange } from "@/lib/agenda-types"
import AgendaEventForm, {
  blankEventDraft,
  eventToDraft,
  type AgendaEventDraft,
} from "@/components/home/AgendaEventForm"
import AgendaMonthGrid from "@/components/home/AgendaMonthGrid"
import AgendaUpcoming from "@/components/home/AgendaUpcoming"
import AgendaWeekGrid from "@/components/home/AgendaWeekGrid"
import HomeAgendaDay from "@/components/home/HomeAgendaDay"
import { eventCoversDate } from "@/lib/agenda-project"
import {
  endOfWeek,
  formatDayMonth,
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

function agendaErrorText(error: string | null) {
  if (!error) return null
  const missing =
    error.includes("does not exist") ||
    error.includes("schema cache") ||
    error.includes("Could not find")
  if (!missing) return error
  if (error.includes("agenda_block_exceptions") || error.includes("start_time")) {
    return "Execute sql-agenda-schedule.sql no Supabase."
  }
  if (error.includes("agenda_weekly")) {
    return "Execute sql-agenda-block-weekdays.sql no Supabase."
  }
  return error
}

export default function HomeAgenda({ userId }: Props) {
  const [tab, setTab] = useState<AgendaTab>("day")
  const [anchor, setAnchor] = useState(() => new Date())
  const [range, setRange] = useState<AgendaRange | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [draft, setDraft] = useState<AgendaEventDraft>(() =>
    blankEventDraft(toDateInputValue(new Date()))
  )
  const [savingEvent, setSavingEvent] = useState(false)
  const requestId = useRef(0)

  const dayStr = toDateInputValue(anchor)
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor])
  const weekEnd = useMemo(() => endOfWeek(anchor), [anchor])
  const monthStart = useMemo(() => startOfMonth(anchor), [anchor])

  const monthGrid = useMemo(() => {
    const gridStart = new Date(monthStart)
    const pad = gridStart.getDay() === 0 ? 6 : gridStart.getDay() - 1
    gridStart.setDate(gridStart.getDate() - pad)
    const cells: Date[] = []
    for (let i = 0; i < 42; i++) {
      const cell = new Date(gridStart)
      cell.setDate(gridStart.getDate() + i)
      cells.push(cell)
    }
    return cells
  }, [monthStart])

  const weekDays = useMemo(() => {
    const days: Date[] = []
    const cursor = new Date(weekStart)
    for (let i = 0; i < 7; i++) {
      days.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    return days
  }, [weekStart])

  const bounds = useMemo(() => {
    if (tab === "week") {
      return { from: toDateInputValue(weekStart), to: toDateInputValue(weekEnd) }
    }
    if (tab === "month") {
      return {
        from: toDateInputValue(monthGrid[0]!),
        to: toDateInputValue(monthGrid[monthGrid.length - 1]!),
      }
    }
    return { from: dayStr, to: dayStr }
  }, [tab, weekStart, weekEnd, monthGrid, dayStr])

  const reload = useCallback(async () => {
    const id = ++requestId.current
    setError(null)
    const today = toDateInputValue(new Date())
    const res = await fetch(
      `/api/agenda/range?user_id=${userId}&from=${bounds.from}&to=${bounds.to}&today=${today}&_=${Date.now()}`
    )
    const data = await res.json()
    if (id !== requestId.current) return
    if (!res.ok) {
      setError(data.error ?? "Erro ao carregar a agenda")
      setRange({
        from: bounds.from,
        to: bounds.to,
        days: [],
        events: [],
        upcoming: [],
      })
      return
    }
    setRange(data as AgendaRange)
    setRevision((value) => value + 1)
  }, [userId, bounds.from, bounds.to])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    setDraft((current) => {
      if (current.id || current.title.trim()) return current
      if (current.event_date === dayStr) return current
      return { ...current, event_date: dayStr }
    })
  }, [dayStr])

  function shiftAnchor(delta: number) {
    const next = new Date(anchor)
    if (tab === "day") next.setDate(next.getDate() + delta)
    else if (tab === "week") next.setDate(next.getDate() + delta * 7)
    else next.setMonth(next.getMonth() + delta)
    setAnchor(next)
  }

  function openDay(date: Date) {
    setAnchor(date)
    setTab("day")
  }

  function openEvent(event: AgendaEvent) {
    setDraft(eventToDraft(event))
  }

  function openUpcoming(event: AgendaEvent) {
    openDay(parseDateInput(event.event_date.slice(0, 10)))
  }

  async function saveEvent() {
    const title = draft.title.trim()
    if (!title || !draft.event_date) return
    setSavingEvent(true)
    setError(null)
    const payload = {
      user_id: userId,
      title,
      event_date: draft.event_date,
      end_date: draft.end_date || null,
      start_time: draft.start_time || null,
      end_time: draft.end_time || null,
      notes: draft.notes.trim() || null,
      color: draft.color,
    }
    const res = await fetch("/api/agenda/events", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft.id ? { ...payload, id: draft.id } : payload),
    })
    const data = await res.json()
    setSavingEvent(false)
    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar evento")
      return
    }
    setDraft(blankEventDraft(dayStr))
    await reload()
  }

  async function removeEvent() {
    if (!draft.id) return
    setSavingEvent(true)
    const res = await fetch(`/api/agenda/events?user_id=${userId}&id=${draft.id}`, {
      method: "DELETE",
    })
    setSavingEvent(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Erro ao excluir evento")
      return
    }
    setDraft(blankEventDraft(dayStr))
    await reload()
  }

  const rangeReady = range?.from === bounds.from && range?.to === bounds.to
  const days: AgendaProjectedDay[] = rangeReady ? (range?.days ?? []) : []
  const events = rangeReady ? (range?.events ?? []) : []
  const selected = days.find((day) => day.date === dayStr)
  const dayEvents = events.filter((event) => eventCoversDate(event, dayStr))

  const headerLabel =
    tab === "day"
      ? anchor.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
      : tab === "week"
        ? `${formatDayMonth(weekStart)} – ${formatDayMonth(weekEnd)}`
        : anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

  const shownError = agendaErrorText(error)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Agenda</h2>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === item.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftAnchor(-1)}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftAnchor(1)}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
            aria-label="Próximo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <p className="text-sm font-medium capitalize text-slate-800">{headerLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setAnchor(new Date())}
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100"
        >
          Hoje
        </button>
      </div>

      {shownError && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{shownError}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 space-y-4">
          {!rangeReady ? (
            <p className="py-6 text-center text-sm text-slate-500">Carregando…</p>
          ) : tab === "day" ? (
            <HomeAgendaDay
              userId={userId}
              anchor={anchor}
              onAnchorChange={setAnchor}
              blocks={selected?.blocks ?? []}
              events={dayEvents}
              revision={revision}
              onReload={reload}
              onEditEvent={openEvent}
            />
          ) : tab === "week" ? (
            <AgendaWeekGrid
              weekDays={weekDays}
              days={days}
              events={events}
              onOpenDay={openDay}
              onEditEvent={openEvent}
            />
          ) : (
            <AgendaMonthGrid
              cells={monthGrid}
              month={anchor.getMonth()}
              days={days}
              events={events}
              onOpenDay={openDay}
            />
          )}

          <AgendaEventForm
            draft={draft}
            saving={savingEvent}
            onChange={setDraft}
            onSubmit={saveEvent}
            onDelete={removeEvent}
            onCancel={() => setDraft(blankEventDraft(dayStr))}
          />
        </div>
        <AgendaUpcoming events={range?.upcoming ?? []} onOpen={openUpcoming} />
      </div>
    </section>
  )
}
