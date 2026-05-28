export type AgendaTimeBlock = {
  id: string
  start_time: string
  end_time: string
  title: string
  plan_text?: string | null
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map((p) => parseInt(p, 10))
  return (h ?? 0) * 60 + (m ?? 0)
}

export function isBlockActive(block: AgendaTimeBlock, nowMinutes: number): boolean {
  const start = timeToMinutes(block.start_time)
  const end = timeToMinutes(block.end_time)
  return nowMinutes >= start && nowMinutes < end
}

export function sortBlocksByStart<T extends AgendaTimeBlock>(blocks: T[]): T[] {
  return [...blocks].sort((a, b) => a.start_time.localeCompare(b.start_time))
}

export function getActiveBlocks<T extends AgendaTimeBlock>(blocks: T[], now: Date): T[] {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return sortBlocksByStart(blocks).filter((b) => isBlockActive(b, nowMinutes))
}

export type AgendaNowStatus<T extends AgendaTimeBlock = AgendaTimeBlock> =
  | { kind: "active"; active: T[]; next: T | null }
  | { kind: "before"; active: []; next: T }
  | { kind: "between"; active: []; next: T }
  | { kind: "after"; active: []; next: null; last: T }

export function getAgendaNowStatus<T extends AgendaTimeBlock>(
  blocks: T[],
  now: Date
): AgendaNowStatus<T> | null {
  const sorted = sortBlocksByStart(blocks)
  if (!sorted.length) return null

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const active = sorted.filter((b) => isBlockActive(b, nowMinutes))

  const findNext = () =>
    sorted.find((b) => timeToMinutes(b.start_time) > nowMinutes) ?? null

  if (active.length > 0) {
    return { kind: "active", active, next: findNext() }
  }

  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!

  if (nowMinutes < timeToMinutes(first.start_time)) {
    return { kind: "before", active: [], next: first }
  }

  if (nowMinutes >= timeToMinutes(last.end_time)) {
    return { kind: "after", active: [], next: null, last }
  }

  const next = findNext()
  if (!next) {
    return { kind: "after", active: [], next: null, last }
  }

  return { kind: "between", active: [], next }
}
