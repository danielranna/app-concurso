import type {
  CyclePlannerDay,
  CyclePlannerInput,
  CyclePlannerResult,
  WeekdayLimits,
} from "./study-cycle-types"

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

export { WEEKDAY_LABELS }

export function defaultWeekdayLimits(): WeekdayLimits[] {
  return [
    { weekday: 0, minutes: 0, active: false, daily_limits: defaultDailyLimits(0) },
    { weekday: 1, minutes: 120, active: true, daily_limits: defaultDailyLimits(120) },
    { weekday: 2, minutes: 120, active: true, daily_limits: defaultDailyLimits(120) },
    { weekday: 3, minutes: 120, active: true, daily_limits: defaultDailyLimits(120) },
    { weekday: 4, minutes: 120, active: true, daily_limits: defaultDailyLimits(120) },
    { weekday: 5, minutes: 120, active: true, daily_limits: defaultDailyLimits(120) },
    { weekday: 6, minutes: 180, active: true, daily_limits: defaultDailyLimits(180) },
  ]
}

function defaultDailyLimits(minutes: number): WeekdayLimits["daily_limits"] {
  if (minutes <= 0) {
    return { questions: 0, flashcards: 0, summaries: 0, error_reviews: 0 }
  }
  const factor = minutes / 120
  return {
    questions: Math.round(50 * factor),
    flashcards: Math.round(20 * factor),
    summaries: Math.max(1, Math.round(2 * factor)),
    error_reviews: Math.round(10 * factor),
  }
}

/** Sugere matérias fracas para aparecer 2× no ciclo (top 20% por brain score). */
function suggestDoubledSubjects(
  subjectIds: string[],
  scores: Record<string, number> | undefined
): Set<string> {
  if (!scores || subjectIds.length < 4) return new Set()
  const ranked = subjectIds
    .map((id) => ({ id, score: scores[id] ?? 0 }))
    .sort((a, b) => b.score - a.score)
  const count = Math.max(1, Math.floor(ranked.length * 0.2))
  return new Set(ranked.slice(0, count).map((r) => r.id))
}

/**
 * Distribui matérias em dias ativos da semana (rodízio).
 * Cada dia recebe até `subjects_per_day` matérias.
 */
export function suggestCyclePlan(
  input: CyclePlannerInput,
  subjectNames: Map<string, string>
): CyclePlannerResult {
  const activeWeekdays = input.weekday_limits
    .filter((w) => w.active && w.minutes > 0)
    .sort((a, b) => a.weekday - b.weekday)

  if (!activeWeekdays.length || !input.subject_ids.length) {
    return { total_days: 0, days: [], subjects_doubled: [] }
  }

  const doubled = suggestDoubledSubjects(
    input.subject_ids,
    input.subject_brain_scores
  )

  const expanded: string[] = []
  for (const sid of input.subject_ids) {
    expanded.push(sid)
    if (doubled.has(sid)) expanded.push(sid)
  }

  const perDay = Math.max(1, input.subjects_per_day)
  const days: CyclePlannerDay[] = []
  let subjectPtr = 0

  for (let dayIndex = 0; subjectPtr < expanded.length; dayIndex++) {
    const wd = activeWeekdays[dayIndex % activeWeekdays.length]
    const batch: string[] = []
    for (let i = 0; i < perDay && subjectPtr < expanded.length; i++) {
      batch.push(expanded[subjectPtr])
      subjectPtr++
    }
    days.push({
      day_index: dayIndex,
      weekday: wd.weekday,
      subject_ids: batch,
      subject_names: batch.map((id) => subjectNames.get(id) ?? id),
      estimated_minutes: wd.minutes,
      daily_limits: wd.daily_limits,
    })
  }

  return {
    total_days: days.length,
    days,
    subjects_doubled: [...doubled],
  }
}

export function scaleLimitsForMinutes(
  base: WeekdayLimits["daily_limits"],
  minutes: number
): WeekdayLimits["daily_limits"] {
  if (minutes <= 0) {
    return { questions: 0, flashcards: 0, summaries: 0, error_reviews: 0 }
  }
  const factor = minutes / 120
  return {
    questions: Math.round(base.questions * factor),
    flashcards: Math.round(base.flashcards * factor),
    summaries: Math.max(1, Math.round(base.summaries * factor)),
    error_reviews: Math.round(base.error_reviews * factor),
  }
}
