"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { Calendar, ChevronLeft, ChevronRight, Download, Info, Maximize2, Pencil, Plus, Settings2, X } from "lucide-react"
import type { AgendaEvent, AgendaEventKind, AgendaFieldType, AgendaMarker, AgendaProjectedDay, AgendaRange } from "@/lib/agenda-types"
import AgendaKindEditor from "@/components/home/AgendaKindEditor"
import AgendaEventForm, {
  blankEventDraft,
  eventToDraft,
  type AgendaEventDraft,
} from "@/components/home/AgendaEventForm"
import AgendaMonthGrid from "@/components/home/AgendaMonthGrid"
import AgendaUpcoming from "@/components/home/AgendaUpcoming"
import AgendaWeekGrid from "@/components/home/AgendaWeekGrid"
import HomeAgendaDay from "@/components/home/HomeAgendaDay"
import { formatAgendaMoney, formatAgendaNumber } from "@/lib/agenda-format"
import { downloadAgendaEventPdf, downloadAgendaKindPdf } from "@/lib/agenda-pdf-download"
import { eventCoversDate } from "@/lib/agenda-project"
import {
  endOfWeek,
  formatDayMonth,
  formatTimeShort,
  parseDateInput,
  startOfMonth,
  startOfWeek,
  toDateInputValue,
} from "@/lib/home-date"

type AgendaTab = "day" | "week" | "month"

type Props = {
  userId: string
  fullPage?: boolean
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
  if (
    error.includes("agenda_event_kind") ||
    error.includes("agenda_event_values") ||
    error.includes("kind_id")
  ) {
    return "Execute sql-agenda-event-kinds.sql no Supabase."
  }
  if (error.includes("agenda_weekly")) {
    return "Execute sql-agenda-block-weekdays.sql no Supabase."
  }
  return error
}

export default function HomeAgenda({ userId, fullPage = false }: Props) {
  const [tab, setTab] = useState<AgendaTab>("day")
  const [anchor, setAnchor] = useState(() => new Date())
  const [range, setRange] = useState<AgendaRange | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [draft, setDraft] = useState<AgendaEventDraft>(() =>
    blankEventDraft(toDateInputValue(new Date()))
  )
  const [savingEvent, setSavingEvent] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [includePast, setIncludePast] = useState(false)
  const [downloadKindId, setDownloadKindId] = useState("")
  const [eventModal, setEventModal] = useState<"create" | "edit" | "info" | "kinds" | "download" | null>(null)
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
        markers: [],
        upcoming: [],
        kinds: [],
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

  function closeEventModal() {
    setEventModal(null)
    setDraft(blankEventDraft(dayStr))
  }

  function openCreate() {
    setDraft(blankEventDraft(dayStr))
    setEventModal("create")
  }

  function draftFromEvent(event: AgendaEvent): AgendaEventDraft {
    const next = eventToDraft(event)
    const kind = (range?.kinds ?? []).find((item) => item.id === event.kind_id)
    if (!kind) return next
    const values = { ...next.values }
    for (const field of kind.fields) {
      const raw = values[field.id]
      if (!raw) continue
      if (field.field_type === "number") values[field.id] = formatAgendaNumber(raw)
      if (field.field_type === "money") values[field.id] = formatAgendaMoney(raw)
    }
    return { ...next, values }
  }

  function openMarker(marker: AgendaMarker, mode: "info" | "edit") {
    const event = (range?.events ?? []).find((item) => item.id === marker.event_id)
    if (!event) return
    setDraft(draftFromEvent(event))
    setEventModal(mode)
  }

  function openUpcoming(marker: AgendaMarker) {
    setAnchor(parseDateInput(marker.event_date.slice(0, 10)))
    openMarker(marker, "info")
  }

  function openCompiledDownload() {
    setIncludePast(false)
    setDownloadKindId((range?.kinds ?? [])[0]?.id ?? "")
    setEventModal("download")
  }

  async function saveEvent() {
    const title = draft.title.trim()
    if (!title || (!draft.kind_id && !draft.event_date)) return
    setSavingEvent(true)
    setError(null)
    const kindFields = (range?.kinds ?? []).find((item) => item.id === draft.kind_id)?.fields ?? []
    const values = Object.entries(draft.values).map(([field_id, value_text]) => {
      const field = kindFields.find((item) => item.id === field_id)
      let text = value_text.trim()
      if (field?.field_type === "number") text = formatAgendaNumber(text)
      if (field?.field_type === "money") text = formatAgendaMoney(text)
      return { field_id, value_text: text || null }
    })
    const payload = draft.kind_id
      ? {
          user_id: userId,
          title,
          kind_id: draft.kind_id,
          notes: draft.notes.trim() || null,
          values,
        }
      : {
          user_id: userId,
          title,
          event_date: draft.event_date,
          end_date: draft.end_date || null,
          start_time: draft.start_time || null,
          end_time: draft.end_time || null,
          notes: draft.notes.trim() || null,
          color: draft.color,
          kind_id: null,
          values: [],
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
    closeEventModal()
    await reload()
  }

  async function downloadCompiled() {
    if (!downloadKindId) return
    setDownloadingPdf(true)
    setError(null)
    try {
      await downloadAgendaKindPdf(userId, downloadKindId, includePast)
      closeEventModal()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao baixar PDF")
    } finally {
      setDownloadingPdf(false)
    }
  }

  async function downloadCurrentEvent() {
    if (!draft.id) return
    setDownloadingPdf(true)
    setError(null)
    try {
      await downloadAgendaEventPdf(userId, draft.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao baixar PDF")
    } finally {
      setDownloadingPdf(false)
    }
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
    closeEventModal()
    await reload()
  }

  const rangeReady = range?.from === bounds.from && range?.to === bounds.to
  const days: AgendaProjectedDay[] = rangeReady ? (range?.days ?? []) : []
  const markers = rangeReady ? (range?.markers ?? []) : []
  const kinds = range?.kinds ?? []
  const selected = days.find((day) => day.date === dayStr)
  const dayMarkers = markers.filter((marker) => eventCoversDate(marker, dayStr))
  const listedMarkers = [...markers].sort(
    (a, b) =>
      a.event_date.localeCompare(b.event_date) ||
      (a.start_time ?? "").localeCompare(b.start_time ?? "") ||
      a.title.localeCompare(b.title)
  )
  const openKind = kinds.find((kind) => kind.id === draft.kind_id)
  const viewed = (range?.events ?? []).find((event) => event.id === draft.id) ?? null
  const modalTitle =
    eventModal === "kinds"
      ? "Tipos de evento"
      : eventModal === "download"
        ? "Baixar compilado"
        : eventModal === "create"
          ? "Novo evento"
          : eventModal === "edit"
            ? openKind?.name ?? "Editar evento"
            : draft.title || "Evento"

  const headerLabel =
    tab === "day"
      ? anchor.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })
      : tab === "week"
        ? `${formatDayMonth(weekStart)} – ${formatDayMonth(weekEnd)}`
        : anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

  const shownError = agendaErrorText(error)

  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-5 ${
        fullPage ? "min-h-[calc(100svh-3rem)]" : ""
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Agenda</h2>
          {!fullPage && (
            <Link
              href="/agenda"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Maximize2 className="h-4 w-4" />
              Abrir agenda
            </Link>
          )}
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

      <div className="space-y-4">
        <AgendaUpcoming events={range?.upcoming ?? []} onOpen={openUpcoming} />
        <div className="min-w-0 space-y-4">
          {!rangeReady ? (
            <p className="py-6 text-center text-sm text-slate-500">Carregando…</p>
          ) : tab === "day" ? (
            <HomeAgendaDay
              userId={userId}
              anchor={anchor}
              onAnchorChange={setAnchor}
              blocks={selected?.blocks ?? []}
              events={dayMarkers}
              revision={revision}
              onReload={reload}
              onEditEvent={(marker) => openMarker(marker, "info")}
            />
          ) : tab === "week" ? (
            <AgendaWeekGrid
              weekDays={weekDays}
              days={days}
              events={markers}
              onOpenDay={openDay}
              onEditEvent={(marker) => openMarker(marker, "info")}
            />
          ) : (
            <AgendaMonthGrid
              cells={monthGrid}
              month={anchor.getMonth()}
              days={days}
              events={markers}
              onOpenDay={openDay}
              onEditEvent={(marker) => openMarker(marker, "info")}
            />
          )}

          <section className="rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
              <p className="text-sm font-medium text-slate-800">Eventos</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                  Novo evento
                </button>
                <button
                  type="button"
                  onClick={openCompiledDownload}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  Baixar
                </button>
                <button
                  type="button"
                  onClick={() => setEventModal("kinds")}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Settings2 className="h-4 w-4" />
                  Config
                </button>
              </div>
            </div>
            {listedMarkers.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">Nenhum evento neste período.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {listedMarkers.map((marker) => {
                  const when = formatDayMonth(parseDateInput(marker.event_date.slice(0, 10)))
                  const time = marker.start_time ? formatTimeShort(marker.start_time) : "dia inteiro"
                  return (
                    <li key={marker.id} className="flex items-center gap-1 pr-2 hover:bg-slate-50">
                      <button
                        type="button"
                        onClick={() => openMarker(marker, "info")}
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: marker.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                          {marker.title}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {when}
                          {time ? ` · ${time}` : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label="Informações"
                        onClick={() => openMarker(marker, "info")}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-white hover:text-slate-800"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Editar"
                        onClick={() => openMarker(marker, "edit")}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-white hover:text-slate-800"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {eventModal && (
        <AgendaDialog title={modalTitle} onClose={closeEventModal}>
          {shownError && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{shownError}</p>
          )}
          {eventModal === "kinds" ? (
            <AgendaKindEditor userId={userId} kinds={kinds} onSaved={reload} onError={setError} />
          ) : eventModal === "download" ? (
            <CompiledDownload
              kinds={kinds}
              kindId={downloadKindId}
              includePast={includePast}
              downloading={downloadingPdf}
              onKindId={setDownloadKindId}
              onIncludePast={setIncludePast}
              onDownload={() => void downloadCompiled()}
            />
          ) : eventModal === "info" && viewed ? (
            <EventInfo
              event={viewed}
              kind={openKind ?? null}
              downloading={downloadingPdf}
              onEdit={() => setEventModal("edit")}
              onDownload={() => void downloadCurrentEvent()}
            />
          ) : (
            <AgendaEventForm
              draft={draft}
              kinds={kinds}
              saving={savingEvent}
              onChange={setDraft}
              onSubmit={saveEvent}
              onDelete={removeEvent}
              onCancel={closeEventModal}
            />
          )}
        </AgendaDialog>
      )}
    </section>
  )
}

function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-")
  if (!year || !month || !day) return iso
  return `${day}/${month}/${year}`
}

function displayFieldValue(type: AgendaFieldType, raw: string | null): string {
  const text = raw?.trim() ?? ""
  if (!text) return "—"
  if (type === "date") return /^\d{4}-\d{2}-\d{2}/.test(text) ? formatIsoDate(text) : text
  if (type === "number") return formatAgendaNumber(text) || "—"
  if (type === "money") return formatAgendaMoney(text) || "—"
  return text
}

function EventInfo({
  event,
  kind,
  downloading,
  onEdit,
  onDownload,
}: {
  event: AgendaEvent
  kind: AgendaEventKind | null
  downloading: boolean
  onEdit: () => void
  onDownload: () => void
}) {
  const byField = new Map(event.values.map((value) => [value.field_id, value.value_text]))
  const rows = kind
    ? kind.fields.map((field) => ({
        label: field.label,
        value: displayFieldValue(field.field_type, byField.get(field.id) ?? null),
      }))
    : [
        { label: "Data", value: event.event_date ? formatIsoDate(event.event_date) : "—" },
        ...(event.end_date ? [{ label: "Até", value: formatIsoDate(event.end_date) }] : []),
        ...(event.start_time ? [{ label: "Início", value: event.start_time.slice(0, 5) }] : []),
        ...(event.end_time ? [{ label: "Fim", value: event.end_time.slice(0, 5) }] : []),
      ]

  return (
    <div className="space-y-3 pt-2">
      <p className="text-sm text-slate-500">{kind?.name ?? "Pontual"}</p>
      <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
            <dt className="text-slate-500">{row.label}</dt>
            <dd className="text-right font-medium text-slate-800">{row.value}</dd>
          </div>
        ))}
      </dl>
      {event.notes && <p className="text-sm text-slate-700">Nota: {event.notes}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Pencil className="h-4 w-4" />
          Editar
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          Baixar PDF
        </button>
      </div>
    </div>
  )
}

function CompiledDownload({
  kinds,
  kindId,
  includePast,
  downloading,
  onKindId,
  onIncludePast,
  onDownload,
}: {
  kinds: AgendaEventKind[]
  kindId: string
  includePast: boolean
  downloading: boolean
  onKindId: (id: string) => void
  onIncludePast: (value: boolean) => void
  onDownload: () => void
}) {
  if (!kinds.length) {
    return <p className="pt-3 text-sm text-slate-600">Crie um tipo em Config para baixar o compilado.</p>
  }
  return (
    <div className="space-y-3 pt-3">
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Tipo
        <select
          value={kindId}
          onChange={(e) => onKindId(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
        >
          {kinds.map((kind) => (
            <option key={kind.id} value={kind.id}>
              {kind.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={includePast} onChange={(e) => onIncludePast(e.target.checked)} />
        Incluir passados?
      </label>
      <p className="text-xs text-slate-500">
        Passou quando todas as datas preenchidas são anteriores a hoje.
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading || !kindId}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          Baixar PDF
        </button>
      </div>
    </div>
  )
}

function AgendaDialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-6 w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
