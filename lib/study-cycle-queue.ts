import { getMaxBlocksForWeekday, DEFAULT_MAX_BLOCKS } from "./study-cycle-planner"
import type { StudyCycle, StudyCycleBlock, WeekdayLimits } from "./study-cycle-types"

export type QueueItem = StudyCycleBlock & {
  queue_position: number
  status: "pending" | "completed"
  completed_at?: string | null
}

export type QueueStats = {
  total: number
  completed: number
  pending: number
  sessions_per_week_capacity: number
  blocks_per_day_label: string
}

export type QueueState = {
  current: QueueItem | null
  pending: QueueItem[]
  completed: QueueItem[]
  stats: QueueStats
}

export type PacePoint = {
  label: string
  expected: number
  actual: number
  period_start: string
}

export type PaceAnalytics = {
  weekly: PacePoint[]
  monthly: PacePoint[]
  sessions_per_week_capacity: number
  blocks_per_day_label: string
}

export function comparePlannedOrder(
  a: StudyCycleBlock,
  b: StudyCycleBlock
): number {
  return a.day_index - b.day_index || a.sort_order - b.sort_order
}

function effectiveQueuePosition(block: StudyCycleBlock, fallbackIndex: number): number {
  if (block.queue_position != null && Number.isFinite(block.queue_position)) {
    return block.queue_position
  }
  return fallbackIndex
}

/** Ordena blocos na sequência do calendário (dia → sort_order). */
export function flattenCycleBlocksToQueue(cycle: StudyCycle): QueueItem[] {
  const blocks = [...(cycle.cycle_blocks ?? [])]
  if (!blocks.length) {
    for (const day of cycle.days ?? []) {
      for (const b of day.blocks ?? []) {
        blocks.push(b)
      }
    }
  }

  const sorted = [...blocks].sort(comparePlannedOrder)
  return sorted.map((block, i) => ({
    ...block,
    queue_position: effectiveQueuePosition(block, i),
    status: block.status ?? "pending",
    completed_at: block.completed_at ?? null,
  }))
}

function blocksPerDayLabel(weekday_limits: WeekdayLimits[]): string {
  const active = weekday_limits.filter((w) => w.active && w.minutes > 0)
  if (!active.length) return "—"
  const caps = active.map((w) => getMaxBlocksForWeekday(w, DEFAULT_MAX_BLOCKS))
  if (caps.length === 1) return `${caps[0]} blocos/dia`
  return `${Math.min(...caps)}–${Math.max(...caps)} blocos/dia`
}

function sessionsCapacityPerWeek(weekday_limits: WeekdayLimits[]): number {
  return weekday_limits
    .filter((w) => w.active && w.minutes > 0)
    .reduce((s, w) => s + getMaxBlocksForWeekday(w, DEFAULT_MAX_BLOCKS), 0)
}

export function getQueueState(cycle: StudyCycle): QueueState {
  // A fila segue o calendário (dia → ordem no dia), não queue_position solto no banco.
  const items = flattenCycleBlocksToQueue(cycle)
  const pending = items.filter((i) => i.status !== "completed")
  const completed = items
    .filter((i) => i.status === "completed")
    .sort((a, b) => {
      const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0
      const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0
      return tb - ta
    })

  const weekCap = sessionsCapacityPerWeek(cycle.weekday_limits ?? [])

  return {
    current: pending[0] ?? null,
    pending,
    completed,
    stats: {
      total: items.length,
      completed: completed.length,
      pending: pending.length,
      sessions_per_week_capacity: weekCap,
      blocks_per_day_label: blocksPerDayLabel(cycle.weekday_limits ?? []),
    },
  }
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  const start = new Date(d)
  start.setDate(d.getDate() - diff)
  start.setHours(0, 0, 0, 0)
  return start
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function formatWeekLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
}

function countCompletedInRange(
  completed: QueueItem[],
  start: Date,
  end: Date
): number {
  return completed.filter((item) => {
    if (!item.completed_at) return false
    const t = new Date(item.completed_at).getTime()
    return t >= start.getTime() && t <= end.getTime()
  }).length
}

/** Curvas cumulativas esperado vs real (semanal e mensal). */
export function buildPaceAnalytics(cycle: StudyCycle): PaceAnalytics {
  const queue = getQueueState(cycle)
  const weekCap = queue.stats.sessions_per_week_capacity
  const blocksLabel = queue.stats.blocks_per_day_label

  const anchor = cycle.started_at
    ? new Date(cycle.started_at)
    : new Date()

  const now = new Date()
  const weekly: PacePoint[] = []
  let expectedCumulative = 0
  let actualCumulative = 0

  for (let w = 0; w < 16; w++) {
    const weekStart = new Date(anchor)
    weekStart.setDate(anchor.getDate() + w * 7)
    weekStart.setHours(0, 0, 0, 0)
    if (weekStart > now && w > 0) break

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    expectedCumulative += weekCap
    const weekActual = countCompletedInRange(
      queue.completed,
      weekStart,
      weekEnd
    )
    actualCumulative += weekActual

    weekly.push({
      label: formatWeekLabel(weekStart),
      expected: expectedCumulative,
      actual: actualCumulative,
      period_start: weekStart.toISOString(),
    })
  }

  const monthly: PacePoint[] = []
  expectedCumulative = 0
  actualCumulative = 0

  const monthStart0 = startOfMonth(anchor)
  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(monthStart0.getFullYear(), monthStart0.getMonth() + m, 1)
    if (monthStart > now && m > 0) break

    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    )

    const weeksInMonth = Math.max(1, Math.ceil(monthEnd.getDate() / 7))
    expectedCumulative += weekCap * weeksInMonth

    const monthActual = countCompletedInRange(
      queue.completed,
      monthStart,
      monthEnd
    )
    actualCumulative += monthActual

    monthly.push({
      label: formatMonthLabel(monthStart),
      expected: expectedCumulative,
      actual: actualCumulative,
      period_start: monthStart.toISOString(),
    })
  }

  return {
    weekly,
    monthly,
    sessions_per_week_capacity: weekCap,
    blocks_per_day_label: blocksLabel,
  }
}

/** Índices iniciais de queue_position ao salvar calendário. */
export function initialQueuePositions(
  blocks: { day_index: number; sort_order: number }[]
): number[] {
  const sorted = [...blocks].sort(
    (a, b) => a.day_index - b.day_index || a.sort_order - b.sort_order
  )
  const positionByKey = new Map<string, number>()
  sorted.forEach((b, i) => {
    positionByKey.set(`${b.day_index}:${b.sort_order}`, i)
  })
  return blocks.map(
    (b) => positionByKey.get(`${b.day_index}:${b.sort_order}`) ?? 0
  )
}

export { startOfWeekMonday, sessionsCapacityPerWeek }
