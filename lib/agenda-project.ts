import { timeToMinutes } from "./agenda-now"
import type {
  AgendaBlockException,
  AgendaDayBlockView,
  AgendaEvent,
  AgendaEventKindField,
  AgendaMarker,
  AgendaProjectedDay,
  AgendaWeeklyBlock,
  IsoWeekday,
} from "./agenda-types"
import { isoWeekdayFromDate, parseDateInput, toDateInputValue } from "./home-date"

export const UPCOMING_LIMIT = 5

export type AgendaPlanRow = {
  id: string
  agenda_date: string
  weekly_block_id: string
  plan_text: string | null
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDateInput(dateStr)
  d.setDate(d.getDate() + days)
  return toDateInputValue(d)
}

export function eachDate(from: string, to: string): string[] {
  if (to < from) return []
  const out: string[] = []
  let cur = from
  for (let i = 0; i < 400 && cur <= to; i++) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

export function dateOnly(value: string): string {
  return value.slice(0, 10)
}

export function projectAgendaDays(input: {
  from: string
  to: string
  blocks: AgendaWeeklyBlock[]
  exceptions: AgendaBlockException[]
  plans: AgendaPlanRow[]
}): AgendaProjectedDay[] {
  const exceptions = new Map(
    input.exceptions.map((ex) => [`${ex.weekly_block_id}|${dateOnly(ex.agenda_date)}`, ex])
  )
  const plans = new Map(
    input.plans.map((plan) => [
      `${plan.weekly_block_id}|${dateOnly(plan.agenda_date)}`,
      plan,
    ])
  )

  return eachDate(input.from, input.to).map((date) => {
    const weekday = isoWeekdayFromDate(parseDateInput(date)) as IsoWeekday
    const blocks: AgendaDayBlockView[] = input.blocks
      .filter((block) => block.weekdays.includes(weekday))
      .map((block) => {
        const exception = exceptions.get(`${block.id}|${date}`)
        const plan = plans.get(`${block.id}|${date}`)
        const rescheduled = exception?.action === "reschedule"
        const title = exception?.title?.trim()
        return {
          ...block,
          start_time:
            rescheduled && exception?.start_time ? exception.start_time : block.start_time,
          end_time: rescheduled && exception?.end_time ? exception.end_time : block.end_time,
          title: rescheduled && title ? title : block.title,
          plan_text: plan?.plan_text ?? null,
          plan_id: plan?.id ?? null,
          exception_id: exception?.id ?? null,
          skipped: exception?.action === "skip",
        }
      })
      .sort(
        (a, b) =>
          a.start_time.localeCompare(b.start_time) || a.sort_order - b.sort_order
      )

    return { date, weekday, blocks }
  })
}

export function visibleBlocks(blocks: AgendaDayBlockView[]): AgendaDayBlockView[] {
  return blocks.filter((block) => !block.skipped)
}

export function eventCoversDate(
  event: { event_date: string | null; end_date: string | null },
  date: string
): boolean {
  if (!event.event_date) return false
  const end = event.end_date ?? event.event_date
  return date >= event.event_date && date <= end
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function projectEventMarkers(input: {
  punctual: AgendaEvent[]
  sheets: AgendaEvent[]
  fields: AgendaEventKindField[]
}): AgendaMarker[] {
  const markers: AgendaMarker[] = []
  for (const event of input.punctual) {
    if (!event.event_date) continue
    markers.push({
      id: `event-${event.id}`,
      event_id: event.id,
      title: event.title,
      event_date: dateOnly(event.event_date),
      end_date: event.end_date ? dateOnly(event.end_date) : null,
      start_time: event.start_time,
      end_time: event.end_time,
      notes: event.notes,
      color: event.color,
    })
  }

  const fieldsById = new Map(input.fields.map((field) => [field.id, field]))
  for (const event of input.sheets) {
    for (const value of event.values ?? []) {
      const field = fieldsById.get(value.field_id)
      if (!field || field.field_type !== "date") continue
      const raw = value.value_text?.trim().slice(0, 10) ?? ""
      if (!ISO_DATE.test(raw)) continue
      markers.push({
        id: `field-${event.id}-${field.id}`,
        event_id: event.id,
        title: `${event.title} · ${field.label}`,
        event_date: raw,
        end_date: null,
        start_time: null,
        end_time: null,
        notes: null,
        color: field.color || "#3b82f6",
      })
    }
  }
  return markers
}

export function markersInRange(markers: AgendaMarker[], from: string, to: string): AgendaMarker[] {
  return markers.filter((marker) => {
    const end = marker.end_date ?? marker.event_date
    return marker.event_date <= to && end >= from
  })
}

export function pickUpcomingMarkers(
  markers: AgendaMarker[],
  today: string,
  limit = UPCOMING_LIMIT
): AgendaMarker[] {
  return markers
    .filter((marker) => (marker.end_date ?? marker.event_date) >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || a.title.localeCompare(b.title))
    .slice(0, limit)
}

/** Três itens em volta do foco: o de cima, o atual e o próximo. */
export function focusWindow(count: number, focus: number, size = 3): { start: number; end: number } {
  if (count <= 0) return { start: 0, end: 0 }
  const safeFocus = Math.min(Math.max(focus, 0), count - 1)
  if (count <= size) return { start: 0, end: count }
  let start = Math.max(0, safeFocus - 1)
  const end = Math.min(count, start + size)
  start = Math.max(0, end - size)
  return { start, end }
}

export function isAllDayEvent(event: { start_time: string | null }): boolean {
  return !event.start_time
}

export function pickUpcomingEvents(
  events: AgendaEvent[],
  today: string,
  limit = UPCOMING_LIMIT
): AgendaEvent[] {
  return events
    .filter((event) => event.event_date && (event.end_date ?? event.event_date)! >= today)
    .sort((a, b) => {
      const byDate = (a.event_date ?? "").localeCompare(b.event_date ?? "")
      if (byDate !== 0) return byDate
      return (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99")
    })
    .slice(0, limit)
}

export function eventSpanEnd(start: string, end: string | null | undefined): string {
  if (end) return end
  const mins = Math.min(timeToMinutes(start) + 60, 24 * 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`
}

export function agendaGridBounds(
  blocks: { start_time: string; end_time: string }[],
  events: { start_time: string | null; end_time: string | null }[]
): { startHour: number; endHour: number } {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const block of blocks) {
    min = Math.min(min, timeToMinutes(block.start_time))
    max = Math.max(max, timeToMinutes(block.end_time))
  }
  for (const event of events) {
    if (!event.start_time) continue
    min = Math.min(min, timeToMinutes(event.start_time))
    max = Math.max(max, timeToMinutes(eventSpanEnd(event.start_time, event.end_time)))
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { startHour: 7, endHour: 22 }
  }

  const startHour = Math.max(0, Math.floor(min / 60))
  const endHour = Math.min(24, Math.max(startHour + 1, Math.ceil(max / 60)))
  return { startHour, endHour }
}

export function layoutDayLanes<T extends { start_time: string; end_time: string }>(
  items: T[]
): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort(
    (a, b) =>
      timeToMinutes(a.start_time) - timeToMinutes(b.start_time) ||
      timeToMinutes(a.end_time) - timeToMinutes(b.end_time)
  )

  const result: (T & { lane: number; lanes: number })[] = []
  let cluster: (T & { lane: number; lanes: number })[] = []
  let clusterEnd = -1
  let laneEnds: number[] = []

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length)
    for (const item of cluster) item.lanes = lanes
    result.push(...cluster)
    cluster = []
    laneEnds = []
    clusterEnd = -1
  }

  for (const item of sorted) {
    const start = timeToMinutes(item.start_time)
    const end = Math.max(timeToMinutes(item.end_time), start + 15)
    if (cluster.length && start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    clusterEnd = Math.max(clusterEnd, end)
    cluster.push({ ...item, lane, lanes: 1 })
  }
  if (cluster.length) flush()
  return result
}
