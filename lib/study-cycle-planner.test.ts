import { describe, expect, it } from "vitest"
import {
  suggestCyclePlan,
  defaultWeekdayLimits,
  normalizeWeekdayLimits,
  getMaxBlocksForWeekday,
  DEFAULT_MAX_BLOCKS,
} from "./study-cycle-planner"
import type { WeekdayLimits } from "./study-cycle-types"

describe("suggestCyclePlan", () => {
  const names = new Map([
    ["a", "Mat A"],
    ["b", "Mat B"],
    ["c", "Mat C"],
    ["d", "Mat D"],
  ])

  function weekdaysMonFri(maxBlocks = DEFAULT_MAX_BLOCKS): WeekdayLimits[] {
    return defaultWeekdayLimits().map((w) =>
      w.weekday >= 1 && w.weekday <= 5
        ? { ...w, active: true, minutes: 120, max_blocks: maxBlocks }
        : { ...w, active: false, minutes: 0, max_blocks: null }
    )
  }

  it("distributes subjects across active weekdays", () => {
    const result = suggestCyclePlan(
      {
        subject_ids: ["a", "b", "c", "d"],
        subjects_per_day: 2,
        weekday_limits: weekdaysMonFri(6),
      },
      names
    )
    expect(result.total_days).toBe(2)
    expect(result.days[0].subject_ids).toHaveLength(2)
    expect(result.days[1].subject_ids).toHaveLength(2)
  })

  it("returns empty when no active weekdays", () => {
    const limits = defaultWeekdayLimits().map((w) => ({
      ...w,
      active: false,
      minutes: 0,
      max_blocks: null,
    }))
    const result = suggestCyclePlan(
      {
        subject_ids: ["a", "b"],
        subjects_per_day: 2,
        weekday_limits: limits,
      },
      names
    )
    expect(result.total_days).toBe(0)
    expect(result.days).toHaveLength(0)
  })

  it("respects max_blocks per weekday and spills overflow to next day", () => {
    const limits = weekdaysMonFri(3)
    const subjectIds = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]
    const result = suggestCyclePlan(
      {
        subject_ids: subjectIds,
        subjects_per_day: 6,
        weekday_limits: limits,
      },
      names
    )

    expect(result.days.every((d) => d.subject_ids.length <= 3)).toBe(true)
    expect(result.days.reduce((sum, d) => sum + d.subject_ids.length, 0)).toBe(10)
    expect(result.total_days).toBeGreaterThan(3)
  })

  it("uses different max_blocks per weekday", () => {
    const limits = defaultWeekdayLimits().map((w) => {
      if (w.weekday === 1) {
        return { ...w, active: true, minutes: 120, max_blocks: 2 }
      }
      if (w.weekday === 2) {
        return { ...w, active: true, minutes: 120, max_blocks: 4 }
      }
      return { ...w, active: false, minutes: 0, max_blocks: null }
    })

    const result = suggestCyclePlan(
      {
        subject_ids: ["a", "b", "c", "d", "e", "f"],
        subjects_per_day: 6,
        weekday_limits: limits,
      },
      names
    )

    expect(result.days[0].subject_ids).toHaveLength(2)
    expect(result.days[0].weekday).toBe(1)
    expect(result.days[1].subject_ids).toHaveLength(4)
    expect(result.days[1].weekday).toBe(2)
  })

  it("skips inactive weekdays in rotation", () => {
    const limits = defaultWeekdayLimits().map((w) => {
      if (w.weekday === 1 || w.weekday === 3 || w.weekday === 5) {
        return { ...w, active: true, minutes: 120, max_blocks: 2 }
      }
      return { ...w, active: false, minutes: 0, max_blocks: null }
    })

    const result = suggestCyclePlan(
      {
        subject_ids: ["a", "b", "c", "d"],
        subjects_per_day: 2,
        weekday_limits: limits,
      },
      names
    )

    expect(result.days.map((d) => d.weekday)).toEqual([1, 3])
  })

  it("falls back to subjects_per_day when max_blocks is unset", () => {
    const limits = weekdaysMonFri().map((w) => ({ ...w, max_blocks: null }))
    expect(getMaxBlocksForWeekday(limits[1], 4)).toBe(4)

    const result = suggestCyclePlan(
      {
        subject_ids: ["a", "b", "c", "d", "e", "f", "g", "h"],
        subjects_per_day: 4,
        weekday_limits: limits,
      },
      names
    )

    expect(result.days[0].subject_ids).toHaveLength(4)
    expect(result.days[1].subject_ids).toHaveLength(4)
  })
})

describe("normalizeWeekdayLimits", () => {
  it("fills missing weekdays from defaults and enforces min max_blocks", () => {
    const normalized = normalizeWeekdayLimits([
      {
        weekday: 1,
        minutes: 90,
        active: true,
        max_blocks: 0,
        daily_limits: {
          questions: 40,
          flashcards: 10,
          summaries: 1,
          error_reviews: 5,
        },
      },
    ])

    expect(normalized).toHaveLength(7)
    expect(normalized[1].max_blocks).toBe(1)
    expect(normalized[0].max_blocks).toBeNull()
  })
})
