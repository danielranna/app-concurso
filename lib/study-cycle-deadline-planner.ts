import { scaleLimitsForMinutes } from "./study-cycle-planner"
import type {
  ManualCycleDayInput,
  StudyCycleBlock,
  StudyCycleContentBlock,
  WeekdayLimits,
} from "./study-cycle-types"

export type SubjectPlanInput = {
  subject_id: string
  subject_name?: string
  weight: number
  blocks: StudyCycleContentBlock[]
}

export type PlannedSession = {
  subject_id: string
  subject_name?: string
  content_block_id: string
  content_block_name: string
  estimated_minutes: number
  weight: number
  block_index: number
  pass_number: number
  mini_cycle_index: number
}

export type CycleStats = {
  total_sessions: number
  mini_cycle_sessions: number
  mini_cycles_to_complete: number
  active_days_in_period: number
  active_days_per_week: number
  sessions_per_day: number
  minutes_per_day_required: number
  minutes_per_day_available: number
  minutes_per_week_available: number
  minutes_per_week_required: number
  minutes_total_required: number
  minutes_total_available: number
  sessions_capacity_in_period: number
  calendar_days_needed: number
  suggested_weeks: number
  target_weeks: number
  weekday_minutes_label: string
  feasible: boolean
  warning?: string
  per_subject: {
    subject_id: string
    subject_name?: string
    block_count: number
    weight: number
    total_sessions: number
    sessions_per_week_needed: number
  }[]
}

export type GenerateCycleInput = {
  subjects: SubjectPlanInput[]
  weekday_limits: WeekdayLimits[]
  target_weeks: number
  default_block_minutes?: number
  subjects_per_day?: number
  planning_mode: "time_driven" | "deadline_driven"
}

export type GenerateCycleResult = {
  stats: CycleStats
  days: ManualCycleDayInput[]
  total_days: number
}

function sumMinutesPerWeek(weekday_limits: WeekdayLimits[]): number {
  return weekday_limits
    .filter((w) => w.active && w.minutes > 0)
    .reduce((s, w) => s + w.minutes, 0)
}

function sessionsCapacityPerWeek(
  weekday_limits: WeekdayLimits[],
  blockMinutes: number
): number {
  return activeWeekdays(weekday_limits).reduce(
    (s, w) => s + Math.floor(w.minutes / blockMinutes),
    0
  )
}

function activeWeekdays(weekday_limits: WeekdayLimits[]): WeekdayLimits[] {
  return weekday_limits
    .filter((w) => w.active && w.minutes > 0)
    .sort((a, b) => a.weekday - b.weekday)
}

/** Sessões totais = Σ (blocos × peso) por matéria */
export function computeTotalSessions(subjects: SubjectPlanInput[]): number {
  return subjects.reduce(
    (sum, s) => sum + s.blocks.length * Math.max(1, s.weight),
    0
  )
}

/** Sessões em um mini-ciclo = Σ peso de cada matéria */
export function computeMiniCycleSessions(subjects: SubjectPlanInput[]): number {
  return subjects.reduce((sum, s) => sum + Math.max(1, s.weight), 0)
}

/** Mini-ciclos necessários = máximo de blocos entre matérias */
export function computeMiniCyclesToComplete(subjects: SubjectPlanInput[]): number {
  if (!subjects.length) return 0
  return Math.max(...subjects.map((s) => s.blocks.length), 1)
}

export function computeCycleStats(input: {
  subjects: SubjectPlanInput[]
  weekday_limits: WeekdayLimits[]
  target_weeks: number
  default_block_minutes?: number
}): CycleStats {
  const { subjects, weekday_limits, target_weeks } = input
  const defaultMinutes = input.default_block_minutes ?? 45
  const activeList = activeWeekdays(weekday_limits)
  const activePerWeek = activeList.length
  const activeDays = activePerWeek * target_weeks
  const totalSessions = computeTotalSessions(subjects)
  const miniCycleSessions = computeMiniCycleSessions(subjects)
  const miniCyclesToComplete = computeMiniCyclesToComplete(subjects)

  const queue = buildFullSessionQueue(subjects)
  const totalMinutesRequired = queue.reduce(
    (s, q) => s + (q.estimated_minutes || defaultMinutes),
    0
  )
  const minutesPerWeek = sumMinutesPerWeek(weekday_limits)
  const totalMinutesAvailable = minutesPerWeek * target_weeks
  const sessionsPerWeekCapacity = sessionsCapacityPerWeek(
    weekday_limits,
    defaultMinutes
  )
  const sessionsCapacityInPeriod = sessionsPerWeekCapacity * target_weeks
  const simulatedDays = distributeSessionsToDays(
    queue,
    weekday_limits,
    defaultMinutes
  )
  const calendarDaysNeeded = simulatedDays.length
  const suggestedWeeks =
    sessionsPerWeekCapacity > 0
      ? Math.ceil(totalSessions / sessionsPerWeekCapacity)
      : target_weeks

  const sessionsPerDay =
    activeDays > 0 ? Math.ceil(totalSessions / activeDays) : 0
  const minutesPerDayRequired =
    activeDays > 0 ? Math.round(totalMinutesRequired / activeDays) : 0
  const minutesPerDayAvailable =
    activePerWeek > 0 ? Math.round(minutesPerWeek / activePerWeek) : 0
  const minutesPerWeekRequired =
    target_weeks > 0 ? Math.round(totalMinutesRequired / target_weeks) : 0

  const dayMinutes = activeList.map((w) => w.minutes)
  const weekdayMinutesLabel =
    dayMinutes.length === 0
      ? "—"
      : dayMinutes.length === 1
        ? `${dayMinutes[0]} min`
        : `${Math.min(...dayMinutes)}–${Math.max(...dayMinutes)} min/dia`

  let feasible = true
  let warning: string | undefined
  if (activeDays === 0) {
    feasible = false
    warning = "Nenhum dia de estudo ativo na semana."
  } else if (
    totalSessions > sessionsCapacityInPeriod ||
    totalMinutesRequired > totalMinutesAvailable * 1.02
  ) {
    feasible = false
    warning = `No prazo de ${target_weeks} semanas cabem ~${sessionsCapacityInPeriod} sessões (≈${Math.round(totalMinutesAvailable / 60)} h), mas você precisa de ${totalSessions} (≈${Math.round(totalMinutesRequired / 60)} h). Tente ~${suggestedWeeks} semanas ou reduza blocos/peso.`
  } else if (calendarDaysNeeded > activeDays) {
    feasible = false
    warning = `O calendário precisa de ${calendarDaysNeeded} dias de estudo, mas há ${activeDays} no prazo. Aumente para ~${Math.ceil(calendarDaysNeeded / activePerWeek)} semanas.`
  }

  const weeks = Math.max(1, target_weeks)
  const per_subject = subjects.map((s) => {
    const blockCount = s.blocks.length
    const weight = Math.max(1, s.weight)
    const totalSessionsForSubject = blockCount * weight
    return {
      subject_id: s.subject_id,
      subject_name: s.subject_name,
      block_count: blockCount,
      weight,
      total_sessions: totalSessionsForSubject,
      sessions_per_week_needed: Math.ceil(totalSessionsForSubject / weeks),
    }
  })

  return {
    total_sessions: totalSessions,
    mini_cycle_sessions: miniCycleSessions,
    mini_cycles_to_complete: miniCyclesToComplete,
    active_days_in_period: activeDays,
    active_days_per_week: activePerWeek,
    sessions_per_day: sessionsPerDay,
    minutes_per_day_required: minutesPerDayRequired,
    minutes_per_day_available: minutesPerDayAvailable,
    minutes_per_week_available: minutesPerWeek,
    minutes_per_week_required: minutesPerWeekRequired,
    minutes_total_required: totalMinutesRequired,
    minutes_total_available: totalMinutesAvailable,
    sessions_capacity_in_period: sessionsCapacityInPeriod,
    calendar_days_needed: calendarDaysNeeded,
    suggested_weeks: suggestedWeeks,
    target_weeks,
    weekday_minutes_label: weekdayMinutesLabel,
    feasible,
    warning,
    per_subject,
  }
}

type SubjectRotation = {
  subject_id: string
  subject_name?: string
  weight: number
  blocks: StudyCycleContentBlock[]
  blockPtr: number
  passCount: number
}

/**
 * Gera fila completa de sessões para o ciclo.
 * Mini-ciclo: para passada p=1..maxWeight, cada matéria com weight>=p recebe 1 sessão.
 * Repete mini-ciclos até cobrir todos os blocos × peso.
 */
export function buildFullSessionQueue(subjects: SubjectPlanInput[]): PlannedSession[] {
  if (!subjects.length) return []

  const rotations: SubjectRotation[] = subjects
    .filter((s) => s.blocks.length > 0)
    .map((s) => ({
      subject_id: s.subject_id,
      subject_name: s.subject_name,
      weight: Math.max(1, s.weight),
      blocks: [...s.blocks].sort((a, b) => a.sort_order - b.sort_order),
      blockPtr: 0,
      passCount: 0,
    }))

  const queue: PlannedSession[] = []
  let miniCycleIndex = 0
  const maxWeight = Math.max(...rotations.map((r) => r.weight))

  while (true) {
    let addedThisMini = false

    for (let p = 1; p <= maxWeight; p++) {
      for (const rot of rotations) {
        if (rot.weight < p) continue
        const totalNeeded = rot.blocks.length * rot.weight
        if (rot.passCount >= totalNeeded) continue

        const block = rot.blocks[rot.blockPtr % rot.blocks.length]
        const passNumber = Math.floor(rot.passCount / rot.blocks.length) + 1

        queue.push({
          subject_id: rot.subject_id,
          subject_name: rot.subject_name,
          content_block_id: block.id,
          content_block_name: block.name,
          estimated_minutes: block.estimated_minutes,
          weight: rot.weight,
          block_index: rot.blockPtr % rot.blocks.length,
          pass_number: passNumber,
          mini_cycle_index: miniCycleIndex,
        })

        rot.passCount++
        rot.blockPtr = (rot.blockPtr + 1) % rot.blocks.length
        addedThisMini = true
      }
    }

    const allDone = rotations.every(
      (r) => r.passCount >= r.blocks.length * r.weight
    )
    if (allDone) return queue
    if (!addedThisMini) return queue

    miniCycleIndex++
  }
}

/** Distribui sessões pelos dias ativos, respeitando minutos disponíveis por dia */
export function distributeSessionsToDays(
  queue: PlannedSession[],
  weekday_limits: WeekdayLimits[],
  defaultBlockMinutes: number
): ManualCycleDayInput[] {
  const active = activeWeekdays(weekday_limits)
  if (!active.length || !queue.length) return []

  const days: ManualCycleDayInput[] = []
  let dayIndex = 0
  let sessionIdx = 0
  let weekDayPtr = 0

  while (sessionIdx < queue.length) {
    const wd = active[weekDayPtr % active.length]
    const maxMinutes = wd.minutes
    let usedMinutes = 0
    const blocks: Omit<StudyCycleBlock, "id" | "cycle_id">[] = []
    let sortOrder = 0

    while (sessionIdx < queue.length) {
      const session = queue[sessionIdx]
      const blockMinutes = session.estimated_minutes || defaultBlockMinutes
      if (blocks.length > 0 && usedMinutes + blockMinutes > maxMinutes) break

      blocks.push({
        day_index: dayIndex,
        subject_id: session.subject_id,
        content_node_id: null,
        content_block_id: session.content_block_id,
        block_type: "questions",
        sort_order: sortOrder++,
        label: session.content_block_name,
        params: {
          question_count: 20,
          minutes: blockMinutes,
          mini_cycle_index: session.mini_cycle_index,
          block_pass: session.pass_number,
        },
      })

      usedMinutes += blockMinutes
      sessionIdx++

      if (usedMinutes >= maxMinutes) break
    }

    if (blocks.length === 0 && sessionIdx < queue.length) {
      const session = queue[sessionIdx]
      blocks.push({
        day_index: dayIndex,
        subject_id: session.subject_id,
        content_node_id: null,
        content_block_id: session.content_block_id,
        block_type: "questions",
        sort_order: 0,
        label: session.content_block_name,
        params: {
          question_count: 20,
          minutes: session.estimated_minutes || defaultBlockMinutes,
          mini_cycle_index: session.mini_cycle_index,
          block_pass: session.pass_number,
        },
      })
      sessionIdx++
    }

    days.push({
      day_index: dayIndex,
      weekday: wd.weekday,
      blocks,
    })

    dayIndex++
    weekDayPtr++
  }

  return days
}

export function generateFullCycle(input: GenerateCycleInput): GenerateCycleResult {
  const defaultMinutes = input.default_block_minutes ?? 45
  const stats = computeCycleStats({
    subjects: input.subjects,
    weekday_limits: input.weekday_limits,
    target_weeks: input.target_weeks,
    default_block_minutes: defaultMinutes,
  })

  const queue = buildFullSessionQueue(input.subjects)
  const days = distributeSessionsToDays(
    queue,
    input.weekday_limits,
    defaultMinutes
  )

  return {
    stats,
    days,
    total_days: days.length,
  }
}

export function scaleWeekdayLimitsForStats(
  weekday_limits: WeekdayLimits[],
  requiredMinutesPerDay: number
): WeekdayLimits[] {
  const base = defaultDailyLimitsFromWeekday(weekday_limits)
  return weekday_limits.map((w) => {
    if (!w.active || w.minutes <= 0) return w
    const scaled = scaleLimitsForMinutes(base, w.minutes)
    return { ...w, daily_limits: scaled }
  })
}

function defaultDailyLimitsFromWeekday(
  weekday_limits: WeekdayLimits[]
): WeekdayLimits["daily_limits"] {
  const active = weekday_limits.find((w) => w.active && w.minutes > 0)
  return (
    active?.daily_limits ?? {
      questions: 50,
      flashcards: 20,
      summaries: 2,
      error_reviews: 10,
    }
  )
}

/** Preview stats without generating full calendar (for live UI) */
export function previewCycleStats(
  subjects: SubjectPlanInput[],
  weekday_limits: WeekdayLimits[],
  target_weeks: number,
  default_block_minutes?: number
): CycleStats {
  return computeCycleStats({
    subjects,
    weekday_limits,
    target_weeks,
    default_block_minutes,
  })
}
