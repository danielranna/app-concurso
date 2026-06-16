import type { WeekdayLimits } from "./study-cycle-types"

export type CyclePlannerInput = {
  subject_ids: string[]
  subjects_per_day: number
  weekday_limits: WeekdayLimits[]
  subject_brain_scores?: Record<string, number>
}

export type CyclePlannerDay = {
  day_index: number
  weekday: number
  subject_ids: string[]
  subject_names: string[]
  estimated_minutes: number
  daily_limits: WeekdayLimits["daily_limits"]
}

export type CyclePlannerResult = {
  total_days: number
  days: CyclePlannerDay[]
  subjects_doubled: string[]
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

export const DEFAULT_MAX_BLOCKS = 6

export { WEEKDAY_LABELS }

function defaultMaxBlocksForWeekday(weekday: number, active: boolean): number | null {
  if (!active) return null
  return weekday === 6 ? 6 : DEFAULT_MAX_BLOCKS
}

export function normalizeWeekdayLimits(
  limits: WeekdayLimits[],
  fallback = defaultWeekdayLimits()
): WeekdayLimits[] {
  const byWeekday = new Map(limits.map((w) => [w.weekday, w]))
  return fallback.map((def) => {
    const w = byWeekday.get(def.weekday) ?? def
    const active = Boolean(w.active && w.minutes > 0)
    const rawMax = w.max_blocks ?? def.max_blocks ?? defaultMaxBlocksForWeekday(w.weekday, active)
    const max_blocks =
      active && rawMax != null && Number.isFinite(rawMax)
        ? Math.max(1, Math.floor(Number(rawMax)))
        : null
    return {
      ...def,
      ...w,
      active,
      minutes: active ? w.minutes : 0,
      max_blocks,
      daily_limits: w.daily_limits ?? def.daily_limits,
    }
  })
}

export function getMaxBlocksForWeekday(
  w: WeekdayLimits,
  subjectsPerDay: number
): number {
  if (w.max_blocks != null && w.max_blocks > 0) {
    return Math.max(1, Math.floor(w.max_blocks))
  }
  return Math.max(1, subjectsPerDay)
}

export function defaultWeekdayLimits(): WeekdayLimits[] {
  return [
    {
      weekday: 0,
      minutes: 0,
      active: false,
      max_blocks: null,
      daily_limits: defaultDailyLimits(0),
    },
    {
      weekday: 1,
      minutes: 120,
      active: true,
      max_blocks: DEFAULT_MAX_BLOCKS,
      daily_limits: defaultDailyLimits(120),
    },
    {
      weekday: 2,
      minutes: 120,
      active: true,
      max_blocks: DEFAULT_MAX_BLOCKS,
      daily_limits: defaultDailyLimits(120),
    },
    {
      weekday: 3,
      minutes: 120,
      active: true,
      max_blocks: DEFAULT_MAX_BLOCKS,
      daily_limits: defaultDailyLimits(120),
    },
    {
      weekday: 4,
      minutes: 120,
      active: true,
      max_blocks: DEFAULT_MAX_BLOCKS,
      daily_limits: defaultDailyLimits(120),
    },
    {
      weekday: 5,
      minutes: 120,
      active: true,
      max_blocks: DEFAULT_MAX_BLOCKS,
      daily_limits: defaultDailyLimits(120),
    },
    {
      weekday: 6,
      minutes: 180,
      active: true,
      max_blocks: DEFAULT_MAX_BLOCKS,
      daily_limits: defaultDailyLimits(180),
    },
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
 * Cada dia respeita `max_blocks` do weekday; excedente vai para o próximo dia ativo.
 */
export function suggestCyclePlan(
  input: CyclePlannerInput,
  subjectNames: Map<string, string>
): CyclePlannerResult {
  const weekdayLimits = normalizeWeekdayLimits(input.weekday_limits)
  const activeWeekdays = weekdayLimits
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
  let dayIndex = 0

  while (subjectPtr < expanded.length) {
    const wd = activeWeekdays[dayIndex % activeWeekdays.length]
    const maxBlocks = getMaxBlocksForWeekday(wd, perDay)
    const targetBatch = Math.min(perDay, maxBlocks)
    const batch: string[] = []

    while (batch.length < targetBatch && subjectPtr < expanded.length) {
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
    dayIndex++
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
