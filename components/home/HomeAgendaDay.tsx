"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Plus, Settings2, Trash2 } from "lucide-react"
import type { AgendaDayBlockView, AgendaWeeklyBlock, IsoWeekday } from "@/lib/agenda-types"
import { getAgendaNowStatus } from "@/lib/agenda-now"
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
  onAnchorChange: (d: Date) => void
}

const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]

export default function HomeAgendaDay({ userId, anchor, onAnchorChange }: Props) {
  const dayStr = toDateInputValue(anchor)
  const weekday = isoWeekdayFromDate(anchor) as IsoWeekday

  const [blocks, setBlocks] = useState<AgendaDayBlockView[]>([])
  const [allBlocks, setAllBlocks] = useState<AgendaWeeklyBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingRoutine, setEditingRoutine] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [defaultWeekdays, setDefaultWeekdays] = useState<Set<IsoWeekday>>(
    () => new Set([weekday])
  )
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const bumpRefresh = useCallback(() => {
    setRefreshVersion((v) => v + 1)
  }, [])

  const loadDayPlan = useCallback(async () => {
    const res = await fetch(
      `/api/agenda/day-plan?user_id=${userId}&date=${dayStr}&_=${Date.now()}`
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
    setBlocks(data.blocks ?? [])
    setError(null)
  }, [userId, dayStr])

  const loadAllBlocks = useCallback(async () => {
    const res = await fetch(
      `/api/agenda/weekly-blocks?user_id=${userId}&_=${Date.now()}`
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Erro ao carregar rotina")
    setAllBlocks(data.blocks ?? [])
    setError(null)
  }, [userId])

  const dataKey = editingRoutine
    ? `routine:${refreshVersion}`
    : `day:${dayStr}:${refreshVersion}`

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      try {
        if (editingRoutine) await loadAllBlocks()
        else await loadDayPlan()
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, editingRoutine])

  useEffect(() => {
    setDefaultWeekdays((prev) => {
      const next = new Set(prev)
      next.add(weekday)
      return next
    })
  }, [weekday])

  function shiftDay(delta: number) {
    const d = new Date(anchor)
    d.setDate(d.getDate() + delta)
    onAnchorChange(d)
  }

  function exitRoutineEditor() {
    setEditingRoutine(false)
    bumpRefresh()
  }

  function updatePlanLocal(blockId: string, text: string) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, plan_text: text } : b))
    )
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

  async function addWeeklyBlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const title = String(fd.get("title")).trim()
    if (!title) return

    const weekdays = ALL_WEEKDAYS.filter((w) => fd.get(`wd_${w}`) === "on")
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
    e.currentTarget.reset()
    setDefaultWeekdays(new Set([weekday]))
    await loadAllBlocks()
    bumpRefresh()
  }

  async function removeWeeklyBlock(id: string) {
    await fetch(`/api/agenda/weekly-blocks?user_id=${userId}&id=${id}`, {
      method: "DELETE",
    })
    await loadAllBlocks()
    bumpRefresh()
  }

  const headerLabel = anchor.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  const sqlHint =
    error?.includes("agenda_weekly_block_days") ||
    error?.includes("agenda_weekly_blocks") ||
    error?.includes("does not exist")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
            aria-label="Dia anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftDay(1)}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
            aria-label="Próximo dia"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <p className="text-sm font-medium capitalize text-slate-800">{headerLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => (editingRoutine ? exitRoutineEditor() : setEditingRoutine(true))}
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

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={dayStr}
          onChange={(e) => onAnchorChange(parseDateInput(e.target.value))}
          disabled={editingRoutine}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
        />
        {!editingRoutine && !isTodayDate(dayStr) && (
          <button
            type="button"
            onClick={() => onAnchorChange(new Date())}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100"
          >
            Hoje
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {sqlHint
            ? "Execute sql-agenda-block-weekdays.sql no Supabase."
            : error}
        </p>
      )}

      {editingRoutine ? (
        <RoutineEditor
          blocks={allBlocks}
          loading={loading}
          defaultWeekdays={defaultWeekdays}
          onDefaultWeekdaysChange={setDefaultWeekdays}
          onAdd={addWeeklyBlock}
          onRemove={removeWeeklyBlock}
        />
      ) : (
        <DayPlanView
          key={dayStr}
          weekday={weekday}
          dayStr={dayStr}
          anchor={anchor}
          blocks={blocks}
          loading={loading}
          onGoToToday={() => onAnchorChange(new Date())}
          onPlanChange={(blockId, text) => {
            updatePlanLocal(blockId, text)
            savePlanDebounced(blockId, text)
          }}
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

function BlockPlanCard({
  block,
  variant = "default",
  onPlanChange,
}: {
  block: AgendaDayBlockView
  variant?: "default" | "now"
  onPlanChange: (blockId: string, text: string) => void
}) {
  return (
    <div
      className={`rounded-lg border bg-white p-3 shadow-sm ${
        variant === "now" ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-200"
      }`}
    >
      {variant === "now" && (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
          Agora
        </p>
      )}
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
    </div>
  )
}

function CompactBlockList({
  blocks,
  onPlanChange,
}: {
  blocks: AgendaDayBlockView[]
  onPlanChange: (blockId: string, text: string) => void
}) {
  return (
    <ul className="max-h-[min(50vh,420px)] space-y-1.5 overflow-y-auto pr-1">
      {blocks.map((b) => (
        <li
          key={b.id}
          className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 sm:flex-row sm:items-center sm:gap-2"
        >
          <div className="min-w-0 shrink-0 sm:w-[11rem]">
            <span className="text-xs text-slate-500">
              {formatTimeShort(b.start_time)}–{formatTimeShort(b.end_time)}
            </span>
            <span className="ml-1.5 text-xs font-medium text-slate-800">{b.title}</span>
          </div>
          <input
            type="text"
            value={b.plan_text ?? ""}
            onChange={(e) => onPlanChange(b.id, e.target.value)}
            placeholder="Plano do dia…"
            className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 placeholder:text-slate-400"
          />
        </li>
      ))}
    </ul>
  )
}

function GapStatusCard({
  status,
}: {
  status: ReturnType<typeof getAgendaNowStatus>
}) {
  if (!status || status.kind === "active") return null

  let message = ""
  if (status.kind === "before") {
    message = `Rotina começa às ${formatTimeShort(status.next.start_time)} · ${status.next.title}`
  } else if (status.kind === "between") {
    message = `Intervalo · próximo: ${status.next.title} às ${formatTimeShort(status.next.start_time)}`
  } else {
    message = `Rotina do dia encerrada (último: ${status.last.title})`
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-600">
      {message}
    </div>
  )
}

function NowAgendaView({
  blocks,
  now,
  showAll,
  onToggleShowAll,
  onPlanChange,
}: {
  blocks: AgendaDayBlockView[]
  now: Date
  showAll: boolean
  onToggleShowAll: () => void
  onPlanChange: (blockId: string, text: string) => void
}) {
  const status = getAgendaNowStatus(blocks, now)

  if (showAll) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">Todos os blocos de hoje</p>
          <button
            type="button"
            onClick={onToggleShowAll}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Ocultar
          </button>
        </div>
        <CompactBlockList blocks={blocks} onPlanChange={onPlanChange} />
      </div>
    )
  }

  const active = status?.kind === "active" ? status.active : []
  const colClass =
    active.length > 1
      ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
      : "grid grid-cols-1 gap-3"

  return (
    <div className="space-y-3">
      {active.length > 0 ? (
        <div className={colClass}>
          {active.map((b) => (
            <BlockPlanCard key={b.id} block={b} variant="now" onPlanChange={onPlanChange} />
          ))}
        </div>
      ) : (
        <GapStatusCard status={status} />
      )}

      {status?.kind === "active" && status.next && (
        <p className="text-xs text-slate-500">
          Próximo: {status.next.title} às {formatTimeShort(status.next.start_time)}
        </p>
      )}

      <button
        type="button"
        onClick={onToggleShowAll}
        className="text-sm font-medium text-blue-600 hover:underline"
      >
        Ver todos os blocos ({blocks.length})
      </button>
    </div>
  )
}

function PlanningDayView({
  planningLabel,
  blocks,
  showAll,
  onToggleShowAll,
  onGoToToday,
  onPlanChange,
}: {
  planningLabel: string
  blocks: AgendaDayBlockView[]
  showAll: boolean
  onToggleShowAll: () => void
  onGoToToday: () => void
  onPlanChange: (blockId: string, text: string) => void
}) {
  if (showAll) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Planejamento · <span className="capitalize text-slate-700">{planningLabel}</span>
          </p>
          <button
            type="button"
            onClick={onToggleShowAll}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Ocultar
          </button>
        </div>
        <CompactBlockList blocks={blocks} onPlanChange={onPlanChange} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Você está vendo outro dia. O bloco &quot;Agora&quot; só aparece em{" "}
        <span className="font-medium text-slate-700">hoje</span>.
      </p>
      <button
        type="button"
        onClick={onGoToToday}
        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Ir para hoje
      </button>
      <button
        type="button"
        onClick={onToggleShowAll}
        className="block text-sm font-medium text-blue-600 hover:underline"
      >
        Planejar este dia · ver todos os blocos ({blocks.length})
      </button>
    </div>
  )
}

function DayPlanView({
  weekday,
  dayStr,
  anchor,
  blocks,
  loading,
  onGoToToday,
  onPlanChange,
}: {
  weekday: IsoWeekday
  dayStr: string
  anchor: Date
  blocks: AgendaDayBlockView[]
  loading: boolean
  onGoToToday: () => void
  onPlanChange: (blockId: string, text: string) => void
}) {
  const isToday = isTodayDate(dayStr)
  const [showAll, setShowAll] = useState(false)
  const now = useNowTick(isToday && !showAll)

  useEffect(() => {
    setShowAll(false)
  }, [dayStr])

  const planningLabel = anchor.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  if (loading) {
    return <p className="py-6 text-center text-sm text-slate-500">Carregando…</p>
  }

  if (blocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
        <p>Nenhum bloco para {isoWeekdayLabel(weekday)}.</p>
        <p className="mt-1 text-slate-500">
          Em &quot;Gerenciar blocos&quot;, crie um bloco e marque os dias em que ele se repete.
        </p>
      </div>
    )
  }

  if (!isToday) {
    return (
      <PlanningDayView
        planningLabel={planningLabel}
        blocks={blocks}
        showAll={showAll}
        onToggleShowAll={() => setShowAll((v) => !v)}
        onGoToToday={onGoToToday}
        onPlanChange={onPlanChange}
      />
    )
  }

  return (
    <NowAgendaView
      blocks={blocks}
      now={now}
      showAll={showAll}
      onToggleShowAll={() => setShowAll((v) => !v)}
      onPlanChange={onPlanChange}
    />
  )
}

function WeekdayCheckboxes({
  defaultWeekdays,
  onDefaultWeekdaysChange,
}: {
  defaultWeekdays: Set<IsoWeekday>
  onDefaultWeekdaysChange: (s: Set<IsoWeekday>) => void
}) {
  return (
    <fieldset className="w-full">
      <legend className="mb-1.5 text-xs font-medium text-slate-600">
        Repete em
      </legend>
      <div className="flex flex-wrap gap-2">
        {ALL_WEEKDAYS.map((w) => (
          <label
            key={w}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
          >
            <input
              type="checkbox"
              name={`wd_${w}`}
              checked={defaultWeekdays.has(w)}
              onChange={(e) => {
                const next = new Set(defaultWeekdays)
                if (e.target.checked) next.add(w)
                else next.delete(w)
                onDefaultWeekdaysChange(next)
              }}
              className="rounded border-slate-300"
            />
            {isoWeekdayShort(w)}
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
  onRemove,
}: {
  blocks: AgendaWeeklyBlock[]
  loading: boolean
  defaultWeekdays: Set<IsoWeekday>
  onDefaultWeekdaysChange: (s: Set<IsoWeekday>) => void
  onAdd: (e: React.FormEvent<HTMLFormElement>) => void
  onRemove: (id: string) => void
}) {
  const sorted = useMemo(
    () => [...blocks].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [blocks]
  )

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
      <div>
        <p className="text-sm font-medium text-slate-800">Seus blocos fixos</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Crie uma vez, escolha os dias da semana em que repete.
        </p>
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-slate-500">Carregando…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum bloco cadastrado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((b) => (
            <li
              key={b.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  {formatTimeShort(b.start_time)} – {formatTimeShort(b.end_time)}
                  <span className="ml-2 font-medium text-slate-900">{b.title}</span>
                </p>
                <p className="mt-0.5 text-xs text-blue-700">
                  {formatWeekdaysLabel(b.weekdays)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(b.id)}
                className="shrink-0 text-slate-400 hover:text-red-600"
                aria-label="Remover bloco"
              >
                <Trash2 className="h-4 w-4" />
              </button>
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
