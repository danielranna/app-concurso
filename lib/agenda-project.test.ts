import assert from "node:assert/strict"
import type { AgendaBlockException, AgendaEvent, AgendaWeeklyBlock } from "./agenda-types"
import {
  agendaGridBounds,
  eventCoversDate,
  isAllDayEvent,
  layoutDayLanes,
  pickUpcomingEvents,
  projectAgendaDays,
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
