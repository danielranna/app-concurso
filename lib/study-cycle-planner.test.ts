import { describe, expect, it } from "vitest"
import { suggestCyclePlan, defaultWeekdayLimits } from "./study-cycle-planner"

describe("suggestCyclePlan", () => {
  const names = new Map([
    ["a", "Mat A"],
    ["b", "Mat B"],
    ["c", "Mat C"],
    ["d", "Mat D"],
  ])

  it("distributes subjects across active weekdays", () => {
    const limits = defaultWeekdayLimits().map((w) =>
      w.weekday >= 1 && w.weekday <= 5
        ? { ...w, active: true, minutes: 120 }
        : { ...w, active: false, minutes: 0 }
    )
    const result = suggestCyclePlan(
      {
        subject_ids: ["a", "b", "c", "d"],
        subjects_per_day: 2,
        weekday_limits: limits,
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
})
