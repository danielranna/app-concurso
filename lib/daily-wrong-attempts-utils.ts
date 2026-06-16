import { startOfDay } from "./flashcard-due"
import type { DailyWrongItem } from "./daily-wrong-attempts-types"

/** Limites do dia civil para `YYYY-MM-DD` (hora local do servidor). */
export function dayBounds(dateStr: string): { start: string; end: string } {
  const anchor = new Date(`${dateStr}T12:00:00`)
  const start = startOfDay(anchor)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function todayDateString(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Mantém só a tentativa errada mais recente de cada questão no dia. */
export function dedupeDailyWrongAttempts(
  rows: DailyWrongItem[]
): DailyWrongItem[] {
  const seen = new Set<string>()
  const out: DailyWrongItem[] = []
  for (const row of rows) {
    if (seen.has(row.question_id)) continue
    seen.add(row.question_id)
    out.push(row)
  }
  return out
}
