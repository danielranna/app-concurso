import type { AgendaMarker } from "./agenda-types"
import { formatTimeShort } from "./home-date"

const TIMEZONE = "America/Sao_Paulo"
const NOTES_LIMIT = 400

export type DayEventLine = {
  title: string
  event_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  notes: string | null
}

function zonedParts(now: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  )
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    dateLabel: `${parts.day}/${parts.month}/${parts.year}`,
    weekday: new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long" }).format(now),
  }
}

function capitalize(value: string): string {
  if (!value) return value
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1)
}

function clock(time: string | null): string | null {
  const value = time?.trim()
  if (!value) return null
  return formatTimeShort(value)
}

function timeLabel(event: DayEventLine): string {
  const start = clock(event.start_time)
  const end = clock(event.end_time)
  if (start && end) return `${start} – ${end}`
  if (start) return `às ${start}`
  if (end) return `até ${end}`
  return "o dia inteiro"
}

function brDate(iso: string): string {
  const [, month, day] = iso.split("-")
  return `${day}/${month}`
}

function notesLine(notes: string | null): string | null {
  const text = notes?.trim()
  if (!text) return null
  const clipped = text.length > NOTES_LIMIT ? `${text.slice(0, NOTES_LIMIT).trimEnd()}…` : text
  return `📝 ${clipped}`
}

function markerNumber(index: number): string {
  const emoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]
  return emoji[index] ?? `${index + 1}.`
}

export function formatTodayEventsWhatsapp(input: {
  weekdayLabel: string
  dateLabel: string
  events: DayEventLine[]
}): string | null {
  if (input.events.length === 0) return null
  const count = input.events.length
  const headline =
    count === 1 ? "🔥 *1 compromisso hoje*" : `🔥 *${count} compromissos hoje*`
  const blocks = input.events.map((event, index) => {
    const lines = [`${markerNumber(index)} *${event.title}*`, `🕐 ${timeLabel(event)}`]
    if (event.end_date && event.end_date !== event.event_date) {
      lines.push(`📆 vai até ${brDate(event.end_date)}`)
    }
    const notes = notesLine(event.notes)
    if (notes) lines.push(notes)
    return lines.join("\n")
  })
  return [
    "📅 *EVENTOS DE HOJE*",
    `${capitalize(input.weekdayLabel)}, ${input.dateLabel}`,
    "",
    headline,
    "",
    blocks.join("\n\n"),
    "",
    "Não deixa passar! 👀💪",
  ].join("\n")
}

function toLine(marker: AgendaMarker): DayEventLine {
  return {
    title: marker.title,
    event_date: marker.event_date,
    end_date: marker.end_date,
    start_time: marker.start_time,
    end_time: marker.end_time,
    notes: marker.notes,
  }
}

export async function buildTodayEventsWhatsapp(
  userId: string,
  now = new Date()
): Promise<string | null> {
  const { iso, dateLabel, weekday } = zonedParts(now, TIMEZONE)
  const { getAgendaRange } = await import("./agenda")
  const range = await getAgendaRange(userId, iso, iso, iso)
  const events = [...range.markers]
    .sort(
      (a, b) =>
        (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99") ||
        a.title.localeCompare(b.title, "pt")
    )
    .map(toLine)
  return formatTodayEventsWhatsapp({ weekdayLabel: weekday, dateLabel, events })
}
