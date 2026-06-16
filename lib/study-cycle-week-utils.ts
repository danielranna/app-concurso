import type { StudyCycle, StudyCycleBlock } from "./study-cycle-types"

export type WeekDay = StudyCycle["days"][0] & { blocks: StudyCycleBlock[] }

export function getDayCellSummary(day: {
  day_index: number
  blocks: { subject_id: string }[]
}): { dayLabel: string; countLabel: string; subjectCount: number; blockCount: number } {
  const subjectCount = new Set(day.blocks.map((b) => b.subject_id)).size
  const blockCount = day.blocks.length
  return {
    dayLabel: `Dia ${day.day_index + 1}`,
    countLabel: `${subjectCount} mat. · ${blockCount} blocos`,
    subjectCount,
    blockCount,
  }
}

export function groupDaysIntoWeeks(
  days: StudyCycle["days"],
  weekdayLimits: StudyCycle["weekday_limits"]
): WeekDay[][] {
  const activeWeekdays = weekdayLimits
    .filter((w) => w.active)
    .map((w) => w.weekday)
    .sort((a, b) => a - b)

  const weeks: WeekDay[][] = []
  let currentWeek: WeekDay[] = []

  for (const day of days) {
    const wd = day.weekday ?? activeWeekdays[0] ?? 1
    if (
      currentWeek.length > 0 &&
      wd <= (currentWeek[currentWeek.length - 1]?.weekday ?? 0)
    ) {
      weeks.push(currentWeek)
      currentWeek = []
    }
    currentWeek.push(day as WeekDay)
  }
  if (currentWeek.length) weeks.push(currentWeek)

  if (!weeks.length && days.length) {
    const perWeek = Math.max(1, activeWeekdays.length)
    for (let i = 0; i < days.length; i += perWeek) {
      weeks.push(days.slice(i, i + perWeek) as WeekDay[])
    }
  }

  return weeks
}

export function enrichCycleDays(cycle: StudyCycle): StudyCycle {
  return {
    ...cycle,
    days: cycle.days.map((day) => ({
      ...day,
      blocks: (
        day.blocks?.length
          ? day.blocks
          : cycle.cycle_blocks.filter((b) => b.day_index === day.day_index)
      ).map((b) => ({
        ...b,
        subject_name:
          b.subject_name ??
          cycle.subjects.find((s) => s.subject_id === b.subject_id)?.subject_name,
      })),
    })),
  }
}
