import { supabaseServer } from "./supabase-server"
import { suggestCyclePlan, defaultWeekdayLimits } from "./study-cycle-planner"
import type {
  CyclePlannerInput,
  CyclePlannerResult,
  StudyCycle,
  StudyCycleDay,
  StudyCycleSubject,
  WeekdayLimits,
} from "./study-cycle-types"

type CycleRow = {
  id: string
  user_id: string
  status: string
  name: string
  subjects_per_day: number
  started_at: string | null
  paused_at: string | null
  current_day_index: number
  total_days: number
}

export async function getCyclePreferences(userId: string) {
  const { data } = await supabaseServer
    .from("coach_study_preferences")
    .select("cycle_enabled, cycle_paused_at, subjects_per_cycle_day, study_mode")
    .eq("user_id", userId)
    .maybeSingle()

  return {
    cycle_enabled: data?.cycle_enabled ?? false,
    cycle_paused_at: data?.cycle_paused_at ?? null,
    subjects_per_cycle_day: Number(data?.subjects_per_cycle_day ?? 2),
    study_mode: (data?.study_mode ?? "pre_edital") as
      | "pre_edital"
      | "pos_edital"
      | "reta_final",
  }
}

export async function setCycleEnabled(
  userId: string,
  enabled: boolean
): Promise<void> {
  const patch: Record<string, unknown> = {
    user_id: userId,
    cycle_enabled: enabled,
    updated_at: new Date().toISOString(),
  }
  if (!enabled) {
    patch.cycle_paused_at = new Date().toISOString()
  } else {
    patch.cycle_paused_at = null
  }
  await supabaseServer.from("coach_study_preferences").upsert(patch)
}

async function loadCycleRelations(cycleId: string): Promise<{
  subjects: StudyCycleSubject[]
  weekday_limits: WeekdayLimits[]
  days: StudyCycleDay[]
}> {
  const [{ data: subRows }, { data: wdRows }, { data: dayRows }] =
    await Promise.all([
      supabaseServer
        .from("study_cycle_subjects")
        .select("subject_id, sort_order, times_in_cycle, subjects(name)")
        .eq("cycle_id", cycleId)
        .order("sort_order"),
      supabaseServer
        .from("study_cycle_weekday_limits")
        .select("*")
        .eq("cycle_id", cycleId)
        .order("weekday"),
      supabaseServer
        .from("study_cycle_days")
        .select("*")
        .eq("cycle_id", cycleId)
        .order("day_index"),
    ])

  const subjects: StudyCycleSubject[] = (subRows ?? []).map((r) => {
    const sub = r.subjects as { name?: string } | { name?: string }[] | null
    const name = Array.isArray(sub) ? sub[0]?.name : sub?.name
    return {
      subject_id: r.subject_id,
      sort_order: r.sort_order,
      times_in_cycle: r.times_in_cycle,
      subject_name: name,
    }
  })

  const weekday_limits: WeekdayLimits[] = (wdRows ?? []).map((r) => ({
    weekday: r.weekday,
    minutes: r.minutes,
    active: r.active,
    daily_limits: r.daily_limits as WeekdayLimits["daily_limits"],
  }))

  const days: StudyCycleDay[] = (dayRows ?? []).map((r) => ({
    id: r.id,
    day_index: r.day_index,
    weekday: r.weekday,
    subject_ids: r.subject_ids ?? [],
    blocks: r.blocks ?? [],
    plan_date: r.plan_date,
  }))

  return { subjects, weekday_limits, days }
}

function rowToCycle(row: CycleRow, rel: Awaited<ReturnType<typeof loadCycleRelations>>): StudyCycle {
  return {
    id: row.id,
    user_id: row.user_id,
    status: row.status as StudyCycle["status"],
    name: row.name,
    subjects_per_day: row.subjects_per_day,
    started_at: row.started_at,
    paused_at: row.paused_at,
    current_day_index: row.current_day_index,
    total_days: row.total_days,
    ...rel,
  }
}

export async function getActiveOrDraftCycle(
  userId: string
): Promise<StudyCycle | null> {
  const { data: row } = await supabaseServer
    .from("study_cycles")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["draft", "active", "paused"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) return null
  const rel = await loadCycleRelations(row.id)
  return rowToCycle(row as CycleRow, rel)
}

export async function getTodayCycleDay(
  userId: string
): Promise<{ cycle: StudyCycle; day: StudyCycleDay } | null> {
  const cycle = await getActiveOrDraftCycle(userId)
  if (!cycle || cycle.status !== "active" || !cycle.days.length) return null

  const idx = cycle.current_day_index % cycle.days.length
  const day = cycle.days[idx]
  if (!day) return null
  return { cycle, day }
}

export async function advanceCycleDayIndex(cycleId: string, totalDays: number): Promise<void> {
  const { data: row } = await supabaseServer
    .from("study_cycles")
    .select("current_day_index")
    .eq("id", cycleId)
    .single()

  const next = ((row?.current_day_index ?? 0) + 1) % Math.max(1, totalDays)
  await supabaseServer
    .from("study_cycles")
    .update({
      current_day_index: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cycleId)
}

export async function saveCycleDraft(
  userId: string,
  input: {
    name?: string
    subjects_per_day: number
    subject_ids: string[]
    weekday_limits: WeekdayLimits[]
    plan: CyclePlannerResult
    subjects_doubled?: string[]
  }
): Promise<StudyCycle> {
  const doubled = new Set(input.subjects_doubled ?? [])

  const { data: existing } = await supabaseServer
    .from("study_cycles")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["draft", "paused"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let cycleId = existing?.id

  if (cycleId) {
    await supabaseServer
      .from("study_cycles")
      .update({
        name: input.name ?? "Meu ciclo",
        subjects_per_day: input.subjects_per_day,
        total_days: input.plan.total_days,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cycleId)

    await Promise.all([
      supabaseServer.from("study_cycle_subjects").delete().eq("cycle_id", cycleId),
      supabaseServer.from("study_cycle_weekday_limits").delete().eq("cycle_id", cycleId),
      supabaseServer.from("study_cycle_days").delete().eq("cycle_id", cycleId),
    ])
  } else {
    const { data: created, error } = await supabaseServer
      .from("study_cycles")
      .insert({
        user_id: userId,
        status: "draft",
        name: input.name ?? "Meu ciclo",
        subjects_per_day: input.subjects_per_day,
        total_days: input.plan.total_days,
      })
      .select("id")
      .single()
    if (error || !created) throw new Error(error?.message ?? "Erro ao criar ciclo")
    cycleId = created.id
  }

  const subjectRows = input.subject_ids.map((sid, i) => ({
    cycle_id: cycleId,
    subject_id: sid,
    sort_order: i,
    times_in_cycle: doubled.has(sid) ? 2 : 1,
  }))
  if (subjectRows.length) {
    await supabaseServer.from("study_cycle_subjects").insert(subjectRows)
  }

  const wdRows = input.weekday_limits.map((w) => ({
    cycle_id: cycleId,
    weekday: w.weekday,
    minutes: w.minutes,
    active: w.active,
    daily_limits: w.daily_limits,
  }))
  if (wdRows.length) {
    await supabaseServer.from("study_cycle_weekday_limits").insert(wdRows)
  }

  const dayRows = input.plan.days.map((d) => ({
    cycle_id: cycleId,
    day_index: d.day_index,
    weekday: d.weekday,
    subject_ids: d.subject_ids,
    blocks: [],
  }))
  if (dayRows.length) {
    await supabaseServer.from("study_cycle_days").insert(dayRows)
  }

  const cycle = await getActiveOrDraftCycle(userId)
  if (!cycle) throw new Error("Ciclo não encontrado após salvar")
  return cycle
}

export async function activateCycle(userId: string, cycleId: string): Promise<StudyCycle> {
  await supabaseServer
    .from("study_cycles")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "active")

  const { error } = await supabaseServer
    .from("study_cycles")
    .update({
      status: "active",
      started_at: new Date().toISOString(),
      paused_at: null,
      current_day_index: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cycleId)
    .eq("user_id", userId)

  if (error) throw new Error(error.message)

  await setCycleEnabled(userId, true)

  const cycle = await getActiveOrDraftCycle(userId)
  if (!cycle) throw new Error("Ciclo não encontrado")
  return cycle
}

export async function pauseCycle(userId: string): Promise<void> {
  const cycle = await getActiveOrDraftCycle(userId)
  if (cycle?.status === "active") {
    await supabaseServer
      .from("study_cycles")
      .update({
        status: "paused",
        paused_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", cycle.id)
  }
  await setCycleEnabled(userId, false)
}

export async function resumeCycle(userId: string): Promise<StudyCycle | null> {
  const cycle = await getActiveOrDraftCycle(userId)
  if (!cycle) return null

  if (cycle.status === "paused" || cycle.status === "draft") {
    await supabaseServer
      .from("study_cycles")
      .update({
        status: "active",
        started_at: cycle.started_at ?? new Date().toISOString(),
        paused_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cycle.id)
  }

  await setCycleEnabled(userId, true)
  return getActiveOrDraftCycle(userId)
}

export async function previewCyclePlan(
  userId: string,
  input: Omit<CyclePlannerInput, "weekday_limits"> & {
    weekday_limits?: WeekdayLimits[]
  }
): Promise<CyclePlannerResult> {
  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)

  const subjectNames = new Map((subjects ?? []).map((s) => [s.id, s.name]))

  const weekday_limits = input.weekday_limits ?? defaultWeekdayLimits()

  return suggestCyclePlan(
    {
      ...input,
      weekday_limits,
    },
    subjectNames
  )
}

export async function getSubjectIdsWithNotebooks(
  userId: string
): Promise<string[]> {
  const { data } = await supabaseServer
    .from("notebooks")
    .select("subject_id")
    .eq("user_id", userId)
    .not("subject_id", "is", null)

  return [...new Set((data ?? []).map((n) => n.subject_id).filter(Boolean) as string[])]
}

export async function getSubjectBrainScores(
  userId: string,
  subjectIds: string[]
): Promise<Record<string, number>> {
  if (!subjectIds.length) return {}

  const { data: queue } = await supabaseServer
    .from("strategic_queue_items")
    .select("subject_id, priority_score, subject_priority")
    .eq("user_id", userId)
    .in("subject_id", subjectIds)
    .eq("priority_source", "brain")

  const scores: Record<string, number> = {}
  for (const sid of subjectIds) {
    const rows = (queue ?? []).filter((q) => q.subject_id === sid)
    if (rows.length) {
      const top = rows
        .map((r) => Number(r.priority_score))
        .sort((a, b) => b - a)
        .slice(0, 3)
      scores[sid] = top.reduce((a, b) => a + b, 0) / top.length
    } else {
      const withSp = rows.find((r) => r.subject_priority != null)
      scores[sid] = Number(withSp?.subject_priority ?? 0)
    }
  }
  return scores
}
