import type {
  DailyWrongItem,
  DailyWrongOption,
} from "./daily-wrong-attempts-types"

/** Dia civil do app (Brasil). Independente do fuso do servidor (Vercel = UTC). */
export const APP_CALENDAR_TZ = "America/Sao_Paulo"

function zonedOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(
    num("year"),
    num("month") - 1,
    num("day"),
    num("hour"),
    num("minute"),
    num("second")
  )
  return asUtc - instant.getTime()
}

function zonedMidnightUtc(dateStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  if (!y || !m || !d) throw new Error("data inválida")
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const offsetMs = zonedOffsetMs(probe, timeZone)
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs)
}

function nextDateString(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1))
  const yy = next.getUTCFullYear()
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(next.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

/** Limites do dia civil `YYYY-MM-DD` em `America/Sao_Paulo`. */
export function dayBounds(
  dateStr: string,
  timeZone = APP_CALENDAR_TZ
): { start: string; end: string } {
  const start = zonedMidnightUtc(dateStr, timeZone)
  const end = zonedMidnightUtc(nextDateString(dateStr), timeZone)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function todayDateString(
  now = new Date(),
  timeZone = APP_CALENDAR_TZ
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
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

export function normalizeAnswerLabel(label: string): string {
  return label.trim().toUpperCase()
}

export function findDailyWrongOption(
  options: DailyWrongOption[],
  label: string
): DailyWrongOption | null {
  const normalized = normalizeAnswerLabel(label)
  if (!normalized) return null
  return (
    options.find((o) => normalizeAnswerLabel(o.label) === normalized) ?? null
  )
}

/** Separa a marcada, o gabarito e o restante das alternativas. */
export function splitDailyWrongOptions(
  options: DailyWrongOption[],
  selectedAnswer: string,
  correctAnswer: string
): {
  marked: DailyWrongOption | null
  gabarito: DailyWrongOption | null
  others: DailyWrongOption[]
} {
  const selected = normalizeAnswerLabel(selectedAnswer)
  const correct = normalizeAnswerLabel(correctAnswer)
  return {
    marked: findDailyWrongOption(options, selectedAnswer),
    gabarito: findDailyWrongOption(options, correctAnswer),
    others: options.filter((o) => {
      const label = normalizeAnswerLabel(o.label)
      return label !== selected && label !== correct
    }),
  }
}
