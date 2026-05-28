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
