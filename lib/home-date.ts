export function isTodayDate(dayStr: string, now = new Date()): boolean {
  return dayStr === toDateInputValue(now)
}

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function parseDateInput(value: string): Date {
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y!, m! - 1, d!)
}

export function startOfWeek(d: Date): Date {
  const copy = new Date(d)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function endOfWeek(d: Date): Date {
  const start = startOfWeek(d)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return end
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export function formatTimeShort(time: string): string {
  return time.slice(0, 5)
}

export function formatWeekdayShort(d: Date): string {
  return d.toLocaleDateString("pt-BR", { weekday: "short" })
}

export function formatDayMonth(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
}

/** 1 = segunda … 7 = domingo (ISO) */
export function isoWeekdayFromDate(d: Date): number {
  const day = d.getDay()
  return day === 0 ? 7 : day
}

const WEEKDAY_NAMES = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
] as const

export function isoWeekdayLabel(weekday: number): string {
  return WEEKDAY_NAMES[weekday - 1] ?? "Dia"
}

export function isoWeekdayShort(weekday: number): string {
  const short = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
  return short[weekday - 1] ?? "?"
}

export function formatWeekdaysLabel(weekdays: number[]): string {
  if (weekdays.length === 7) return "Todos os dias"
  if (
    weekdays.length === 5 &&
    [1, 2, 3, 4, 5].every((d) => weekdays.includes(d))
  ) {
    return "Seg–Sex"
  }
  return weekdays.map((w) => isoWeekdayShort(w)).join(", ")
}
