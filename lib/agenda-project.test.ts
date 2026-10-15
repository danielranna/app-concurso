import assert from "node:assert/strict"
import type { AgendaBlockException, AgendaEvent, AgendaWeeklyBlock } from "./agenda-types"
import {
  agendaGridBounds,
  eventCoversDate,
  focusWindow,
  isAllDayEvent,
  layoutDayLanes,
  markersInRange,
  pickUpcomingEvents,
  pickUpcomingMarkers,
  projectAgendaDays,
  projectEventMarkers,
  visibleBlocks,
} from "./agenda-project"

function weekly(
  id: string,
  weekdays: AgendaWeeklyBlock["weekdays"],
  start: string,
  end: string,
  title = id
): AgendaWeeklyBlock {
  return {
    id,
    user_id: "u",
    weekdays,
    start_time: start,
    end_time: end,
    title,
    color: "#1e293b",
    sort_order: 0,
  }
}

const study = weekly("study", [1, 3, 5], "06:00:00", "12:00:00", "Concurso")
const gym = weekly("gym", [1], "18:00:00", "19:00:00", "Treino")

const days = projectAgendaDays({
  from: "2026-10-12",
  to: "2026-10-18",
  blocks: [study, gym],
  exceptions: [],
  plans: [],
})

assert.equal(days.length, 7)
assert.deepEqual(
  days.find((day) => day.date === "2026-10-12")?.blocks.map((block) => block.id),
  ["study", "gym"]
)
assert.deepEqual(
  days.find((day) => day.date === "2026-10-13")?.blocks.map((block) => block.id),
  []
)
assert.deepEqual(
  days.find((day) => day.date === "2026-10-14")?.blocks.map((block) => block.id),
  ["study"]
)

const skip: AgendaBlockException = {
  id: "ex-skip",
  user_id: "u",
  weekly_block_id: "gym",
  agenda_date: "2026-10-12",
  action: "skip",
  start_time: null,
  end_time: null,
  title: null,
}
const move: AgendaBlockException = {
  id: "ex-move",
  user_id: "u",
  weekly_block_id: "study",
  agenda_date: "2026-10-12",
  action: "reschedule",
  start_time: "08:00:00",
  end_time: "10:00:00",
  title: "Revisão",
}

const monday = projectAgendaDays({
  from: "2026-10-12",
  to: "2026-10-12",
  blocks: [study, gym],
  exceptions: [skip, move],
  plans: [
    {
      id: "plan-1",
      agenda_date: "2026-10-12",
      weekly_block_id: "study",
      plan_text: "Direito constitucional",
    },
  ],
})[0]!

const shown = visibleBlocks(monday.blocks)
assert.equal(shown.length, 1)
assert.equal(shown[0]!.title, "Revisão")
assert.equal(shown[0]!.start_time, "08:00:00")
assert.equal(shown[0]!.plan_text, "Direito constitucional")
assert.equal(shown[0]!.exception_id, "ex-move")
assert.equal(monday.blocks.find((block) => block.id === "gym")?.skipped, true)

const friday = projectAgendaDays({
  from: "2026-10-16",
  to: "2026-10-16",
  blocks: [study],
  exceptions: [move],
  plans: [],
})[0]!
assert.equal(friday.blocks[0]!.title, "Concurso")
assert.equal(friday.blocks[0]!.start_time, "06:00:00")

function event(partial: Partial<AgendaEvent> & Pick<AgendaEvent, "id" | "event_date">): AgendaEvent {
  return {
    user_id: "u",
    title: partial.id,
    end_date: null,
    start_time: null,
    end_time: null,
    notes: null,
    color: "#3b82f6",
    kind_id: null,
    values: [],
    ...partial,
  }
}

const prova = event({ id: "prova", title: "Prova", event_date: "2026-10-20", start_time: "14:00:00" })
const inscricao = event({
  id: "inscricao",
  title: "Inscrição",
  event_date: "2026-10-01",
  end_date: "2026-10-18",
})
const passado = event({ id: "velho", event_date: "2026-09-01", end_date: "2026-09-02" })

assert.equal(eventCoversDate(inscricao, "2026-10-12"), true)
assert.equal(eventCoversDate(inscricao, "2026-10-19"), false)
assert.equal(isAllDayEvent(inscricao), true)
assert.equal(isAllDayEvent(prova), false)

const upcoming = pickUpcomingEvents([passado, prova, inscricao], "2026-10-15")
assert.deepEqual(
  upcoming.map((item) => item.id),
  ["inscricao", "prova"]
)

const edital = event({
  id: "sefaz",
  title: "SEFAZ DF",
  event_date: null,
  kind_id: "kind-1",
  values: [
    { field_id: "banca", value_text: "FGV" },
    { field_id: "abre", value_text: "2026-10-20" },
    { field_id: "fecha", value_text: "" },
    { field_id: "prova-field", value_text: "2026-11-08" },
  ],
})
const markers = projectEventMarkers({
  punctual: [prova],
  sheets: [edital],
  fields: [
    { id: "banca", kind_id: "kind-1", label: "Banca", field_type: "text", color: null, sort_order: 0 },
    { id: "abre", kind_id: "kind-1", label: "Início da inscrição", field_type: "date", color: "#22c55e", sort_order: 1 },
    { id: "fecha", kind_id: "kind-1", label: "Fim da inscrição", field_type: "date", color: "#ef4444", sort_order: 2 },
    { id: "prova-field", kind_id: "kind-1", label: "Data da realização", field_type: "date", color: "#8b5cf6", sort_order: 3 },
  ],
})
assert.deepEqual(
  markers.map((marker) => marker.title),
  ["Prova", "SEFAZ DF · Início da inscrição", "SEFAZ DF · Data da realização"]
)
assert.equal(markers[1]!.color, "#22c55e")
assert.deepEqual(
  markersInRange(markers, "2026-11-01", "2026-11-30").map((marker) => marker.event_date),
  ["2026-11-08"]
)
assert.deepEqual(
  pickUpcomingMarkers(markers, "2026-10-21").map((marker) => marker.event_date),
  ["2026-11-08"]
)

assert.deepEqual(focusWindow(10, 4), { start: 3, end: 6 })
assert.deepEqual(focusWindow(10, 0), { start: 0, end: 3 })
assert.deepEqual(focusWindow(10, 9), { start: 7, end: 10 })
assert.deepEqual(focusWindow(2, 1), { start: 0, end: 2 })

assert.deepEqual(agendaGridBounds([], []), { startHour: 7, endHour: 22 })
assert.deepEqual(
  agendaGridBounds([{ start_time: "05:30:00", end_time: "06:00:00" }], []),
  { startHour: 5, endHour: 6 }
)
assert.deepEqual(
  agendaGridBounds([], [{ start_time: "21:00:00", end_time: "23:30:00" }]),
  { startHour: 21, endHour: 24 }
)

const lanes = layoutDayLanes([
  { id: "a", start_time: "08:00:00", end_time: "10:00:00" },
  { id: "b", start_time: "09:00:00", end_time: "11:00:00" },
  { id: "c", start_time: "14:00:00", end_time: "15:00:00" },
])
const byId = new Map(lanes.map((item) => [item.id, item]))
assert.equal(byId.get("a")!.lanes, 2)
assert.equal(byId.get("b")!.lanes, 2)
assert.notEqual(byId.get("a")!.lane, byId.get("b")!.lane)
assert.equal(byId.get("c")!.lanes, 1)
assert.equal(byId.get("c")!.lane, 0)

console.log("agenda-project.test.ts: ok")
