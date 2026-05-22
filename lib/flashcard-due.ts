import { State } from "ts-fsrs"
import { deserializeFsrsCard } from "./fsrs-scheduler"

export function startOfDay(date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Mesmo dia civil (evita bugs de fuso com endOfDay). */
export function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

/** Atrasado (antes de agora e não só “mais tarde hoje”). */
export function isOverdue(dueAt: Date, now = new Date()): boolean {
  return dueAt < now && !isSameCalendarDay(dueAt, now)
}

/** Para hoje: atrasados + qualquer horário no dia de hoje. */
export function isDueForToday(dueAt: Date | null, now = new Date()): boolean {
  if (!dueAt) return true
  const due = new Date(dueAt)
  if (isSameCalendarDay(due, now)) return true
  return due < startOfDay(now)
}

/** Fila de estudo: já venceu OU revisão agendada para mais tarde hoje. */
export function isEligibleForStudy(
  dueAt: string | Date,
  stateData: Record<string, unknown> | null | undefined,
  now = new Date()
): boolean {
  const due = new Date(dueAt)
  if (due <= now) return true

  const st = stateData
    ? deserializeFsrsCard(stateData).state
    : State.New

  if (isSameCalendarDay(due, now) && (st === State.Review || st === State.New)) {
    return true
  }

  return false
}
