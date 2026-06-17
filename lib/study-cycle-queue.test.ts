import { describe, expect, it } from "vitest"
import {
  buildPaceAnalytics,
  flattenCycleBlocksToQueue,
  getQueueState,
  initialQueuePositions,
} from "./study-cycle-queue"
import { defaultWeekdayLimits } from "./study-cycle-planner"
import type { StudyCycle, StudyCycleBlock } from "./study-cycle-types"

function block(
  id: string,
  day: number,
  sort: number,
  overrides: Partial<StudyCycleBlock> = {}
): StudyCycleBlock {
  return {
    id,
    day_index: day,
    sort_order: sort,
    subject_id: "s1",
    content_node_id: null,
    block_type: "questions",
    label: `Bloco ${id}`,
    params: {},
    subject_name: "Mat A",
    ...overrides,
  }
}

function makeCycle(blocks: StudyCycleBlock[]): StudyCycle {
  const limits = defaultWeekdayLimits().map((w) =>
    w.weekday >= 1 && w.weekday <= 5
      ? { ...w, active: true, minutes: 120, max_blocks: 6 }
      : w.weekday === 6
        ? { ...w, active: true, minutes: 180, max_blocks: 6 }
        : { ...w, active: false, minutes: 0, max_blocks: null }
  )
  return {
    id: "c1",
    user_id: "u1",
    status: "active",
    name: "Test",
    subjects_per_day: 2,
    started_at: "2026-01-01T12:00:00Z",
    paused_at: null,
    current_day_index: 0,
    total_days: 3,
    subjects: [{ subject_id: "s1", sort_order: 0, times_in_cycle: 1, subject_name: "Mat A" }],
    weekday_limits: limits,
    days: [],
    cycle_blocks: blocks,
  }
}

describe("flattenCycleBlocksToQueue", () => {
  it("orders by day_index then sort_order", () => {
    const items = flattenCycleBlocksToQueue(
      makeCycle([
        block("b", 1, 0),
        block("a", 0, 1),
        block("c", 0, 0),
      ])
    )
    expect(items.map((i) => i.id)).toEqual(["c", "a", "b"])
  })
})

describe("getQueueState", () => {
  it("picks first pending as current", () => {
    const state = getQueueState(
      makeCycle([
        block("1", 0, 0, { status: "completed", queue_position: 0 }),
        block("2", 0, 1, { queue_position: 1 }),
        block("3", 1, 0, { queue_position: 2 }),
      ])
    )
    expect(state.current?.id).toBe("2")
    expect(state.stats.completed).toBe(1)
    expect(state.stats.pending).toBe(2)
  })

  it("ignores stale queue_position and follows calendar order", () => {
    const state = getQueueState(
      makeCycle([
        block("done-a", 0, 0, { status: "completed", queue_position: 0 }),
        block("done-b", 0, 1, { status: "completed", queue_position: 1 }),
        block("adm", 0, 2, { label: "Dir Adm", queue_position: 99 }),
        block("ti7", 5, 0, {
          label: "TI Bloco 7",
          queue_position: 2,
          subject_name: "TI",
        }),
      ])
    )
    expect(state.current?.id).toBe("adm")
    expect(state.pending[1]?.id).toBe("ti7")
  })

  it("computes weekly capacity from max_blocks", () => {
    const state = getQueueState(makeCycle([block("1", 0, 0)]))
    expect(state.stats.sessions_per_week_capacity).toBe(36)
    expect(state.stats.blocks_per_day_label).toContain("blocos/dia")
  })
})

describe("initialQueuePositions", () => {
  it("assigns sequential positions in calendar order", () => {
    const blocks = [
      { day_index: 1, sort_order: 0 },
      { day_index: 0, sort_order: 1 },
      { day_index: 0, sort_order: 0 },
    ]
    expect(initialQueuePositions(blocks)).toEqual([2, 1, 0])
  })
})

describe("buildPaceAnalytics", () => {
  it("builds weekly cumulative series", () => {
    const cycle = makeCycle([
      block("1", 0, 0, {
        status: "completed",
        completed_at: "2026-01-02T10:00:00Z",
        queue_position: 0,
      }),
    ])
    const pace = buildPaceAnalytics(cycle)
    expect(pace.weekly.length).toBeGreaterThan(0)
    expect(pace.weekly[0].expected).toBe(36)
    expect(pace.sessions_per_week_capacity).toBe(36)
  })
})
