import { describe, expect, it } from "vitest"
import {
  buildFullSessionQueue,
  computeCycleStats,
  computeMiniCycleSessions,
  computeTotalSessions,
  distributeSessionsToDays,
  generateFullCycle,
  resolveSubjectsPerDayLimit,
} from "./study-cycle-deadline-planner"
import { defaultWeekdayLimits } from "./study-cycle-planner"
import type { SubjectPlanInput } from "./study-cycle-deadline-planner"
import type { StudyCycleContentBlock } from "./study-cycle-types"

function makeBlock(
  id: string,
  subjectId: string,
  name: string,
  sort: number
): StudyCycleContentBlock {
  return {
    id,
    cycle_id: "c1",
    subject_id: subjectId,
    name,
    sort_order: sort,
    estimated_minutes: 45,
    topics: [],
  }
}

function makeSubjects(): SubjectPlanInput[] {
  return [
    {
      subject_id: "a",
      subject_name: "Mat A",
      weight: 1,
      blocks: [
        makeBlock("b1", "a", "Bloco 1", 0),
        makeBlock("b2", "a", "Bloco 2", 1),
      ],
    },
    {
      subject_id: "b",
      subject_name: "Mat B",
      weight: 2,
      blocks: [makeBlock("b3", "b", "Bloco 1", 0)],
    },
  ]
}

describe("computeCycleStats", () => {
  it("calculates total sessions as blocks × weight", () => {
    const subjects = makeSubjects()
    expect(computeTotalSessions(subjects)).toBe(2 * 1 + 1 * 2)
    expect(computeMiniCycleSessions(subjects)).toBe(1 + 2)
  })

  it("computes sessions per day for deadline", () => {
    const limits = defaultWeekdayLimits().map((w) =>
      w.weekday >= 1 && w.weekday <= 5
        ? { ...w, active: true, minutes: 120, max_blocks: 6 }
        : { ...w, active: false, minutes: 0, max_blocks: null }
    )
    const stats = computeCycleStats({
      subjects: makeSubjects(),
      weekday_limits: limits,
      target_weeks: 4,
      default_block_minutes: 45,
    })
    expect(stats.active_days_per_week).toBe(5)
    expect(stats.active_days_in_period).toBe(20)
    expect(stats.total_sessions).toBe(4)
    expect(stats.sessions_per_day).toBe(Math.ceil(4 / 20))
    expect(stats.sessions_per_week_capacity).toBe(30)
    expect(stats.sessions_capacity_in_period).toBe(120)
  })

  it("suggests weeks from block capacity, not minutes", () => {
    const limitsLowMinutes = defaultWeekdayLimits().map((w) =>
      w.weekday >= 1 && w.weekday <= 5
        ? { ...w, active: true, minutes: 60, max_blocks: 6 }
        : { ...w, active: false, minutes: 0, max_blocks: null }
    )
    const limitsHighMinutes = defaultWeekdayLimits().map((w) =>
      w.weekday >= 1 && w.weekday <= 5
        ? { ...w, active: true, minutes: 360, max_blocks: 6 }
        : { ...w, active: false, minutes: 0, max_blocks: null }
    )
    const subjects: SubjectPlanInput[] = Array.from({ length: 10 }, (_, i) => ({
      subject_id: `s${i}`,
      subject_name: `Mat ${i}`,
      weight: 1,
      blocks: [makeBlock(`b${i}`, `s${i}`, `Bloco ${i}`, 0)],
    }))
    const low = computeCycleStats({
      subjects,
      weekday_limits: limitsLowMinutes,
      target_weeks: 4,
      default_block_minutes: 45,
    })
    const high = computeCycleStats({
      subjects,
      weekday_limits: limitsHighMinutes,
      target_weeks: 4,
      default_block_minutes: 45,
    })
    expect(low.sessions_per_week_capacity).toBe(30)
    expect(high.sessions_per_week_capacity).toBe(30)
    expect(low.suggested_weeks).toBe(high.suggested_weeks)
    expect(low.suggested_weeks).toBe(1)
  })
})

describe("buildFullSessionQueue", () => {
  it("interleaves by weight passes", () => {
    const queue = buildFullSessionQueue(makeSubjects())
    expect(queue.length).toBe(4)
    const subjectOrder = queue.map((s) => s.subject_id)
    expect(subjectOrder.filter((id) => id === "b").length).toBe(2)
    expect(subjectOrder.filter((id) => id === "a").length).toBe(2)
  })
})

describe("generateFullCycle", () => {
  it("produces days with blocks", () => {
    const limits = defaultWeekdayLimits().map((w) =>
      w.weekday >= 1 && w.weekday <= 5
        ? { ...w, active: true, minutes: 180 }
        : { ...w, active: false, minutes: 0 }
    )
    const result = generateFullCycle({
      subjects: makeSubjects(),
      weekday_limits: limits,
      target_weeks: 4,
      default_block_minutes: 45,
      planning_mode: "deadline_driven",
    })
    expect(result.days.length).toBeGreaterThan(0)
    const totalBlocks = result.days.reduce((s, d) => s + d.blocks.length, 0)
    expect(totalBlocks).toBe(4)
  })

  it("respects max_blocks per weekday when distributing", () => {
    const limits = defaultWeekdayLimits().map((w) =>
      w.weekday === 1
        ? { ...w, active: true, minutes: 600, max_blocks: 3 }
        : w.weekday === 2
          ? { ...w, active: true, minutes: 600, max_blocks: 4 }
          : { ...w, active: false, minutes: 0, max_blocks: null }
    )
    const queue = buildFullSessionQueue(makeSubjects())
    const days = distributeSessionsToDays(queue, limits, 45)
    const maxByWeekday = new Map(limits.map((w) => [w.weekday, w.max_blocks ?? 6]))
    for (const day of days) {
      const cap = maxByWeekday.get(day.weekday ?? 0) ?? 6
      expect(day.blocks.length).toBeLessThanOrEqual(cap)
    }
  })

  it("caps distinct subjects per day", () => {
    const limits = defaultWeekdayLimits().map((w) =>
      w.weekday === 1
        ? { ...w, active: true, minutes: 600 }
        : { ...w, active: false, minutes: 0 }
    )
    const subjects: SubjectPlanInput[] = Array.from({ length: 9 }, (_, i) => ({
      subject_id: `s${i}`,
      subject_name: `Mat ${i}`,
      weight: 1,
      blocks: [makeBlock(`b${i}`, `s${i}`, `Bloco ${i}`, 0)],
    }))
    const queue = buildFullSessionQueue(subjects)
    const days = distributeSessionsToDays(queue, limits, 45, 6)

    expect(days.length).toBeGreaterThan(1)
    for (const day of days) {
      const distinct = new Set(day.blocks.map((b) => b.subject_id)).size
      expect(distinct).toBeLessThanOrEqual(6)
    }
    expect(days.reduce((s, d) => s + d.blocks.length, 0)).toBe(9)
  })

  it("caps distinct subjects per day with realistic minutes (mini-ciclo burst)", () => {
    const limits = defaultWeekdayLimits().map((w) =>
      w.weekday >= 1 && w.weekday <= 6
        ? { ...w, active: true, minutes: 360 }
        : { ...w, active: false, minutes: 0 }
    )
    const subjects: SubjectPlanInput[] = Array.from({ length: 21 }, (_, i) => ({
      subject_id: `s${i}`,
      subject_name: `Mat ${i}`,
      weight: 1,
      blocks: [makeBlock(`b${i}`, `s${i}`, `Bloco ${i}`, 0)],
    }))
    const result = generateFullCycle({
      subjects,
      weekday_limits: limits,
      target_weeks: 12,
      default_block_minutes: 45,
      subjects_per_day: 6,
      planning_mode: "deadline_driven",
    })

    for (const day of result.days) {
      const distinct = new Set(day.blocks.map((b) => b.subject_id)).size
      expect(distinct).toBeLessThanOrEqual(6)
    }
    const firstDaySubjects = new Set(
      result.days[0].blocks.map((b) => b.subject_id)
    ).size
    expect(firstDaySubjects).toBe(6)
    expect(result.days[0].blocks.length).toBeLessThanOrEqual(6)
    expect(result.distribution_stats.subjects_per_day_used).toBe(6)
    expect(result.distribution_stats.max_distinct_subjects_in_any_day).toBeLessThanOrEqual(
      6
    )
    expect(result.days.reduce((s, d) => s + d.blocks.length, 0)).toBe(21)
  })
})

describe("resolveSubjectsPerDayLimit", () => {
  it("prefers valid body override", () => {
    expect(resolveSubjectsPerDayLimit(8, 6)).toBe(8)
  })

  it("falls back to prefs when body is invalid", () => {
    expect(resolveSubjectsPerDayLimit(undefined, 6)).toBe(6)
    expect(resolveSubjectsPerDayLimit("abc", 6)).toBe(6)
    expect(resolveSubjectsPerDayLimit(NaN, 6)).toBe(6)
  })

  it("defaults to 2 when nothing valid", () => {
    expect(resolveSubjectsPerDayLimit(undefined, undefined)).toBe(2)
  })
})
