import assert from "node:assert/strict"
import { formatTodayEventsWhatsapp } from "./agenda-day-message"

const base = {
  weekdayLabel: "quinta-feira",
  dateLabel: "29/10/2026",
}

assert.equal(formatTodayEventsWhatsapp({ ...base, events: [] }), null)

const one = formatTodayEventsWhatsapp({
  ...base,
  events: [
    {
      title: "Prova de Auditoria",
      event_date: "2026-10-29",
      end_date: null,
      start_time: "14:00:00",
      end_time: "18:30:00",
      notes: "Levar documento",
    },
  ],
})
assert.ok(one?.includes("📅 *EVENTOS DE HOJE*"))
assert.ok(one?.includes("Quinta-feira, 29/10/2026"))
assert.ok(one?.includes("🔥 *1 compromisso hoje*"))
assert.ok(one?.includes("1️⃣ *Prova de Auditoria*"))
assert.ok(one?.includes("🕐 14:00 – 18:30"))
assert.ok(one?.includes("📝 Levar documento"))
assert.ok(one?.includes("Não deixa passar! 👀💪"))

const allDay = formatTodayEventsWhatsapp({
  ...base,
  events: [
    {
      title: "Inscrição",
      event_date: "2026-10-28",
      end_date: "2026-10-30",
      start_time: null,
      end_time: null,
      notes: null,
    },
    {
      title: "Revisão",
      event_date: "2026-10-29",
      end_date: null,
      start_time: "09:00",
      end_time: null,
      notes: null,
    },
  ],
})
assert.ok(allDay?.includes("🔥 *2 compromissos hoje*"))
assert.ok(allDay?.includes("🕐 o dia inteiro"))
assert.ok(allDay?.includes("📆 vai até 30/10"))
assert.ok(allDay?.includes("🕐 às 09:00"))
assert.ok(allDay?.includes("2️⃣ *Revisão*"))

console.log("agenda-day-message ok")
