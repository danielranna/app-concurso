"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Plus, Settings2, Trash2 } from "lucide-react"
import type { AgendaDayBlockView, AgendaEvent, AgendaWeeklyBlock, IsoWeekday } from "@/lib/agenda-types"
import { getAgendaNowStatus, isBlockActive, timeToMinutes } from "@/lib/agenda-now"
import { isAllDayEvent, visibleBlocks } from "@/lib/agenda-project"
import {
  formatTimeShort,
  formatWeekdaysLabel,
  isTodayDate,
  isoWeekdayFromDate,
  isoWeekdayLabel,
  isoWeekdayShort,
  parseDateInput,
  toDateInputValue,
} from "@/lib/home-date"

type Props = {
  userId: string
  anchor: Date
  onAnchorChange: (date: Date) => void
  blocks: AgendaDayBlockView[]
  events: AgendaEvent[]
  revision: number
  onReload: () => Promise<void>
  onEditEvent: (event: AgendaEvent) => void
}

const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]

export default function HomeAgendaDay({
  userId,
  anchor,
  onAnchorChange,
  blocks,
  events,
  revision,
  onReload,
  onEditEvent,
}: Props) {
  const dayStr = toDateInputValue(anchor)
  const weekday = isoWeekdayFromDate(anchor) as IsoWeekday
  const [rows, setRows] = useState(blocks)
  const [editingRoutine, setEditingRoutine] = useState(false)
  const [allBlocks, setAllBlocks] = useState<AgendaWeeklyBlock[]>([])
  const [routineLoading, setRoutineLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [defaultWeekdays, setDefaultWeekdays] = useState<Set<IsoWeekday>>(
    () => new Set([weekday])
  )
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const structureKey = `${revision}:${blocks
    .map((block) => `${block.id}:${block.skipped}:${block.exception_id}:${block.start_time}:${block.end_time}:${block.title}`)
    .join("|")}`

  useEffect(() => {
    setRows(blocks)
    // A revisão e a estrutura do bloco reiniciam a lista; o texto do plano fica local enquanto se digita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey])

  useEffect(() => {
    setDefaultWeekdays((prev) => {
      const next = new Set(prev)
      next.add(weekday)
      return next
    })
  }, [weekday])

  async function loadAllBlocks() {
    setRoutineLoading(true)
    const res = await fetch(`/api/agenda/weekly-blocks?user_id=${userId}&_=${Date.now()}`)
    const data = await res.json()
    setRoutineLoading(false)
    if (!res.ok) {
      setError(data.error ?? "Erro ao carregar rotina")
      return
    }
    setAllBlocks(data.blocks ?? [])
    setError(null)
  }

  useEffect(() => {
    if (!editingRoutine) return
    let cancelled = false
    async function run() {
      await loadAllBlocks()
      if (cancelled) return
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRoutine, userId])

  function updatePlanLocal(blockId: string, text: string) {
    setRows((prev) => prev.map((block) => (block.id === blockId ? { ...block, plan_text: text } : block)))
  }

  function savePlanDebounced(blockId: string, text: string) {
    const prev = saveTimers.current.get(blockId)
    if (prev) clearTimeout(prev)
    saveTimers.current.set(
      blockId,
      setTimeout(async () => {
        await fetch("/api/agenda/day-plan", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            agenda_date: dayStr,
            weekly_block_id: blockId,
            plan_text: text,
          }),
        })
      }, 600)
    )
  }

  async function addWeeklyBlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fd = new FormData(event.currentTarget)
    const title = String(fd.get("title")).trim()
    if (!title) return
    const weekdays = ALL_WEEKDAYS.filter((day) => fd.get(`wd_${day}`) === "on")
    if (!weekdays.length) {
      setError("Marque pelo menos um dia da semana")
      return
    }
    const res = await fetch("/api/agenda/weekly-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        weekdays,
        start_time: String(fd.get("start_time")),
        end_time: String(fd.get("end_time")),
        title,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Erro ao criar bloco")
      return
    }
    event.currentTarget.reset()
    setDefaultWeekdays(new Set([weekday]))
    await loadAllBlocks()
    await onReload()
  }

  async function saveWeeklyBlock(input: {
    id: string
    title: string
    start_time: string
    end_time: string
    weekdays: IsoWeekday[]
  }) {
    const res = await fetch("/api/agenda/weekly-blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, ...input }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Erro ao editar bloco")
      return false
    }
    await loadAllBlocks()
    await onReload()
    return true
  }

  async function removeWeeklyBlock(id: string) {
    await fetch(`/api/agenda/weekly-blocks?user_id=${userId}&id=${id}`, { method: "DELETE" })
    await loadAllBlocks()
    await onReload()
  }

  async function putException(body: Record<string, unknown>) {
    const res = await fetch("/api/agenda/exceptions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, agenda_date: dayStr, ...body }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? "Erro ao alterar o dia")
      return
    }
    setError(null)
    await onReload()
  }

  async function undoException(id: string) {
    await fetch(`/api/agenda/exceptions?user_id=${userId}&id=${id}`, { method: "DELETE" })
    await onReload()
  }

  const shown = visibleBlocks(rows)
  const skipped = rows.filter((block) => block.skipped)
  const allDay = events.filter((event) => isAllDayEvent(event))
  const timed = events
    .filter((event) => event.start_time)
    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dayStr}
            onChange={(e) => onAnchorChange(parseDateInput(e.target.value))}
            disabled={editingRoutine}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={() => setEditingRoutine((value) => !value)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
            editingRoutine
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Settings2 className="h-4 w-4" />
          {editingRoutine ? "Voltar ao dia" : "Gerenciar blocos"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>
      )}

      {editingRoutine ? (
        <RoutineEditor
          blocks={allBlocks}
          loading={routineLoading}
          defaultWeekdays={defaultWeekdays}
          onDefaultWeekdaysChange={setDefaultWeekdays}
          onAdd={addWeeklyBlock}
          onSave={saveWeeklyBlock}
          onRemove={removeWeeklyBlock}
        />
      ) : (
        <DaySchedule
          weekday={weekday}
          dayStr={dayStr}
          blocks={shown}
          skipped={skipped}
          allDay={allDay}
          timed={timed}
          onPlanChange={(blockId, text) => {
            updatePlanLocal(blockId, text)
            savePlanDebounced(blockId, text)
          }}
          onSkip={(blockId) => putException({ weekly_block_id: blockId, action: "skip" })}
          onReschedule={(blockId, start, end, title) =>
            putException({
              weekly_block_id: blockId,
              action: "reschedule",
              start_time: start,
              end_time: end,
              title,
            })
          }
          onUndo={undoException}
          onEditRoutine={() => setEditingRoutine(true)}
          onEditEvent={onEditEvent}
        />
      )}
    </div>
  )
}

function useNowTick(enabled: boolean) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!enabled) return
    const tick = () => setNow(new Date())
    const id = setInterval(tick, 60_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [enabled])
  return now
}

function DaySchedule({
  weekday,
  dayStr,
  blocks,
  skipped,
  allDay,
  timed,
  onPlanChange,
  onSkip,
  onReschedule,
  onUndo,
  onEditRoutine,
  onEditEvent,
}: {
  weekday: IsoWeekday
  dayStr: string
  blocks: AgendaDayBlockView[]
  skipped: AgendaDayBlockView[]
  allDay: AgendaEvent[]
  timed: AgendaEvent[]
  onPlanChange: (blockId: string, text: string) => void
  onSkip: (blockId: string) => void
  onReschedule: (blockId: string, start: string, end: string, title: string) => void
  onUndo: (exceptionId: string) => void
  onEditRoutine: () => void
  onEditEvent: (event: AgendaEvent) => void
}) {
  const isToday = isTodayDate(dayStr)
  const now = useNowTick(isToday)
  const status = isToday ? getAgendaNowStatus(blocks, now) : null
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const merged: { at: number; kind: "block" | "event"; block?: AgendaDayBlockView; event?: AgendaEvent }[] = [
      ...blocks.map((block) => ({
        at: timeToMinutes(block.start_time),
        kind: "block" as const,
        block,
      })),
      ...timed.map((event) => ({
        at: timeToMinutes(event.start_time ?? "00:00"),
        kind: "event" as const,
        event,
      })),
    ]
    return merged.sort((a, b) => a.at - b.at)
  }, [blocks, timed])

  if (blocks.length === 0 && skipped.length === 0 && allDay.length === 0 && timed.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
        <p>Nenhum bloco para {isoWeekdayLabel(weekday)}.</p>
        <p className="mt-1 text-slate-500">
          Em &quot;Gerenciar blocos&quot;, crie um bloco e marque os dias em que ele se repete.
        </p>
      </div>
    )
  }

  let statusText = ""
  if (status?.kind === "before") {
    statusText = `Rotina começa às ${formatTimeShort(status.next.start_time)} · ${status.next.title}`
  } else if (status?.kind === "between") {
    statusText = `Intervalo · próximo: ${status.next.title} às ${formatTimeShort(status.next.start_time)}`
  } else if (status?.kind === "after") {
    statusText = `Rotina do dia encerrada (último: ${status.last.title})`
  }

  return (
    <div className="space-y-3">
      {statusText && <p className="text-sm text-slate-600">{statusText}</p>}

      {allDay.length > 0 && (
        <ul className="space-y-1">
          {allDay.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onEditEvent(event)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white"
                style={{ backgroundColor: event.color }}
              >
                <span className="font-medium">{event.title}</span>
                <span className="text-xs opacity-80">dia inteiro</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-2">
        {rows.map((row) => {
          if (row.kind === "event" && row.event) {
            const event = row.event
            return (
              <li key={`event-${event.id}`}>
                <button
                  type="button"
                  onClick={() => onEditEvent(event)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-white"
                  style={{ backgroundColor: event.color }}
                >
                  <span className="font-medium">{event.title}</span>
                  <span className="text-xs">
                    {formatTimeShort(event.start_time ?? "")}
                    {event.end_time ? `–${formatTimeShort(event.end_time)}` : ""}
                  </span>
                </button>
              </li>
            )
          }

          const block = row.block!
          const active = isToday && isBlockActive(block, now.getHours() * 60 + now.getMinutes())
          return (
            <li
              key={block.id}
              className={`rounded-lg border bg-white p-3 shadow-sm ${
                active ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {active && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Agora
                  </span>
                )}
                {block.exception_id && (
                  <span className="text-xs font-medium text-amber-700">Só neste dia</span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-500">
                {formatTimeShort(block.start_time)} – {formatTimeShort(block.end_time)}
              </p>
              <p className="font-semibold text-slate-900">{block.title}</p>
              <label className="mt-2 block text-xs text-slate-600">
                O que vou fazer hoje
                <input
                  type="text"
                  value={block.plan_text ?? ""}
                  onChange={(e) => onPlanChange(block.id, e.target.value)}
                  placeholder="Ex.: Direito constitucional e LTE"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800 placeholder:text-slate-400"
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
                <button type="button" onClick={() => onSkip(block.id)} className="text-slate-600 hover:underline">
                  Pular só hoje
                </button>
                <button
                  type="button"
                  onClick={() => setRescheduleId((current) => (current === block.id ? null : block.id))}
                  className="text-slate-600 hover:underline"
                >
                  Mudar só hoje
                </button>
                <button type="button" onClick={onEditRoutine} className="text-blue-700 hover:underline">
                  Editar rotina
                </button>
                {block.exception_id && (
                  <button
                    type="button"
                    onClick={() => onUndo(block.exception_id!)}
                    className="text-amber-800 hover:underline"
                  >
                    Voltar à rotina
                  </button>
                )}
              </div>
              {rescheduleId === block.id && (
                <RescheduleForm
                  start={block.start_time.slice(0, 5)}
                  end={block.end_time.slice(0, 5)}
                  title={block.title}
                  onCancel={() => setRescheduleId(null)}
                  onSave={(start, end, title) => {
                    setRescheduleId(null)
                    onReschedule(block.id, start, end, title)
                  }}
                />
              )}
            </li>
          )
        })}
      </ul>

      {skipped.length > 0 && (
        <ul className="space-y-1">
          {skipped.map((block) => (
            <li
              key={block.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-500"
            >
              <span>
                Pulado hoje · {block.title} ({formatTimeShort(block.start_time)}–
                {formatTimeShort(block.end_time)})
              </span>
              {block.exception_id && (
                <button
                  type="button"
                  onClick={() => onUndo(block.exception_id!)}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Desfazer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RescheduleForm({
  start,
  end,
  title,
  onSave,
  onCancel,
}: {
  start: string
  end: string
  title: string
  onSave: (start: string, end: string, title: string) => void
  onCancel: () => void
}) {
  const [startTime, setStartTime] = useState(start)
  const [endTime, setEndTime] = useState(end)
  const [name, setName] = useState(title)

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(startTime, endTime, name)
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        De
        <input
          type="time"
          required
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Até
        <input
          type="time"
          required
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="min-w-[140px] flex-1 flex-col gap-1 text-xs text-slate-600">
        Nome neste dia
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">
        Salvar neste dia
      </button>
      <button type="button" onClick={onCancel} className="px-2 py-2 text-sm text-slate-600">
        Cancelar
      </button>
    </form>
  )
}

function WeekdayCheckboxes({
  defaultWeekdays,
  onDefaultWeekdaysChange,
  namePrefix = "wd",
}: {
  defaultWeekdays: Set<IsoWeekday>
  onDefaultWeekdaysChange: (days: Set<IsoWeekday>) => void
  namePrefix?: string
}) {
  return (
    <fieldset className="w-full">
      <legend className="mb-1.5 text-xs font-medium text-slate-600">Repete em</legend>
      <div className="flex flex-wrap gap-2">
        {ALL_WEEKDAYS.map((day) => (
          <label
            key={day}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
          >
            <input
              type="checkbox"
              name={`${namePrefix}_${day}`}
              checked={defaultWeekdays.has(day)}
              onChange={(e) => {
                const next = new Set(defaultWeekdays)
                if (e.target.checked) next.add(day)
                else next.delete(day)
                onDefaultWeekdaysChange(next)
              }}
              className="rounded border-slate-300"
            />
            {isoWeekdayShort(day)}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function RoutineEditor({
  blocks,
  loading,
  defaultWeekdays,
  onDefaultWeekdaysChange,
  onAdd,
  onSave,
  onRemove,
}: {
  blocks: AgendaWeeklyBlock[]
  loading: boolean
  defaultWeekdays: Set<IsoWeekday>
  onDefaultWeekdaysChange: (days: Set<IsoWeekday>) => void
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void
  onSave: (input: {
    id: string
    title: string
    start_time: string
    end_time: string
    weekdays: IsoWeekday[]
  }) => Promise<boolean>
  onRemove: (id: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const sorted = useMemo(
    () => [...blocks].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [blocks]
  )

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
      <div>
        <p className="text-sm font-medium text-slate-800">Seus blocos fixos</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Crie uma vez, escolha os dias da semana em que repete. A edição vale para a rotina inteira.
        </p>
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-slate-500">Carregando…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum bloco cadastrado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((block) => (
            <li key={block.id} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
              {editingId === block.id ? (
                <BlockEditForm
                  block={block}
                  onCancel={() => setEditingId(null)}
                  onSave={async (input) => {
                    const ok = await onSave({ id: block.id, ...input })
                    if (ok) setEditingId(null)
                  }}
                />
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      {formatTimeShort(block.start_time)} – {formatTimeShort(block.end_time)}
                      <span className="ml-2 font-medium text-slate-900">{block.title}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-blue-700">{formatWeekdaysLabel(block.weekdays)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(block.id)}
                      className="text-xs font-medium text-slate-600 hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(block.id)}
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Remover bloco"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="space-y-3 border-t border-slate-200 pt-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            De
            <input
              name="start_time"
              type="time"
              required
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Até
            <input
              name="end_time"
              type="time"
              required
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="min-w-[120px] flex-1 flex-col gap-1 text-xs text-slate-600">
            Nome do bloco
            <input
              name="title"
              type="text"
              required
              placeholder="Ex.: Concurso"
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <WeekdayCheckboxes
          defaultWeekdays={defaultWeekdays}
          onDefaultWeekdaysChange={onDefaultWeekdaysChange}
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          Adicionar bloco
        </button>
      </form>
    </div>
  )
}

function BlockEditForm({
  block,
  onSave,
  onCancel,
}: {
  block: AgendaWeeklyBlock
  onSave: (input: {
    title: string
    start_time: string
    end_time: string
    weekdays: IsoWeekday[]
  }) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(block.title)
  const [start, setStart] = useState(block.start_time.slice(0, 5))
  const [end, setEnd] = useState(block.end_time.slice(0, 5))
  const [days, setDays] = useState<Set<IsoWeekday>>(() => new Set(block.weekdays))

  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault()
        await onSave({
          title,
          start_time: start,
          end_time: end,
          weekdays: ALL_WEEKDAYS.filter((day) => days.has(day)),
        })
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          De
          <input
            type="time"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Até
          <input
            type="time"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="min-w-[120px] flex-1 flex-col gap-1 text-xs text-slate-600">
          Nome
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <WeekdayCheckboxes
        defaultWeekdays={days}
        onDefaultWeekdaysChange={setDays}
        namePrefix={`edit_${block.id}`}
      />
      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white">
          Salvar rotina
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-1.5 text-sm text-slate-600">
          Cancelar
        </button>
      </div>
    </form>
  )
}
