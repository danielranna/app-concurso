import { supabaseServer } from "./supabase-server"
import { loadContentBlocksForCycle } from "./study-cycle-content-blocks-db"
import { defaultWeekdayLimits } from "./study-cycle-planner"
import type {
  ManualCycleSaveInput,
  StudyCycle,
  StudyCycleBlock,
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
  planning_mode?: string | null
  target_weeks?: number | null
  default_block_minutes?: number | null
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

async function loadCycleBlocks(cycleId: string): Promise<StudyCycleBlock[]> {
  const { data: rows } = await supabaseServer
    .from("study_cycle_blocks")
    .select(
      "*, subjects(name), subject_content_nodes(name, notebook_id)"
    )
    .eq("cycle_id", cycleId)
    .order("sort_order")

  const sorted = (rows ?? []).sort(
    (a, b) => a.day_index - b.day_index || a.sort_order - b.sort_order
  )

  return sorted.map((r) => {
    const sub = r.subjects as { name?: string } | { name?: string }[] | null
    const node = r.subject_content_nodes as
      | { name?: string; notebook_id?: string }
      | { name?: string; notebook_id?: string }[]
      | null
    const subName = Array.isArray(sub) ? sub[0]?.name : sub?.name
    const nodeObj = Array.isArray(node) ? node[0] : node
    return {
      id: r.id,
      cycle_id: r.cycle_id,
      day_index: r.day_index,
      subject_id: r.subject_id,
      content_node_id: r.content_node_id,
      content_block_id: r.content_block_id ?? null,
      block_type: r.block_type as StudyCycleBlock["block_type"],
      sort_order: r.sort_order,
      label: r.label ?? "",
      params: (r.params ?? {}) as StudyCycleBlock["params"],
      subject_name: subName,
      content_node_name: nodeObj?.name,
    }
  })
}

function blocksToDays(
  blocks: StudyCycleBlock[],
  totalDays: number
): StudyCycleDay[] {
  const days: StudyCycleDay[] = []
  for (let i = 0; i < totalDays; i++) {
    const dayBlocks = blocks
      .filter((b) => b.day_index === i)
      .sort((a, b) => a.sort_order - b.sort_order)
    const subject_ids = [...new Set(dayBlocks.map((b) => b.subject_id))]
    days.push({
      day_index: i,
      weekday: null,
      subject_ids,
      blocks: dayBlocks,
    })
  }
  return days
}

async function loadCycleRelations(cycleId: string, totalDays: number): Promise<{
  subjects: StudyCycleSubject[]
  weekday_limits: WeekdayLimits[]
  days: StudyCycleDay[]
  cycle_blocks: StudyCycleBlock[]
  content_blocks: Awaited<ReturnType<typeof loadContentBlocksForCycle>>
}> {
  const [{ data: subRows }, { data: wdRows }, { data: dayRows }, cycle_blocks, content_blocks] =
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
      loadCycleBlocks(cycleId),
      loadContentBlocksForCycle(cycleId),
    ])

  const subjects: StudyCycleSubject[] = (subRows ?? []).map((r) => {
    const sub = r.subjects as { name?: string } | { name?: string }[] | null
    const name = Array.isArray(sub) ? sub[0]?.name : sub?.name
    return {
      subject_id: r.subject_id,
      sort_order: r.sort_order,
      times_in_cycle: r.times_in_cycle,
      weight: r.times_in_cycle,
      subject_name: name,
    }
  })

  const weekday_limits: WeekdayLimits[] = (wdRows ?? []).map((r) => ({
    weekday: r.weekday,
    minutes: r.minutes,
    active: r.active,
    daily_limits: r.daily_limits as WeekdayLimits["daily_limits"],
  }))

  let days: StudyCycleDay[]
  if (cycle_blocks.length > 0) {
    days = blocksToDays(cycle_blocks, totalDays)
    for (const dr of dayRows ?? []) {
      const d = days.find((x) => x.day_index === dr.day_index)
      if (d) {
        d.weekday = dr.weekday
        d.id = dr.id
        d.plan_date = dr.plan_date
      }
    }
  } else {
    days = (dayRows ?? []).map((r) => ({
      id: r.id,
      day_index: r.day_index,
      weekday: r.weekday,
      subject_ids: r.subject_ids ?? [],
      blocks: [],
      plan_date: r.plan_date,
    }))
  }

  return { subjects, weekday_limits, days, cycle_blocks, content_blocks }
}

function rowToCycle(
  row: CycleRow,
  rel: Awaited<ReturnType<typeof loadCycleRelations>>
): StudyCycle {
  return {
    id: row.id,
    user_id: row.user_id,
    status: row.status as StudyCycle["status"],
    name: row.name,
    subjects_per_day: row.subjects_per_day,
    planning_mode: (row.planning_mode ?? "time_driven") as StudyCycle["planning_mode"],
    target_weeks: row.target_weeks ?? null,
    default_block_minutes: row.default_block_minutes ?? 45,
    started_at: row.started_at,
    paused_at: row.paused_at,
    current_day_index: row.current_day_index,
    total_days: row.total_days,
    subjects: rel.subjects,
    weekday_limits: rel.weekday_limits,
    days: rel.days,
    cycle_blocks: rel.cycle_blocks,
    content_blocks: rel.content_blocks,
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
  const rel = await loadCycleRelations(row.id, row.total_days ?? 0)
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

export async function getTodayCycleBlocks(
  userId: string
): Promise<{ cycle: StudyCycle; day: StudyCycleDay; blocks: StudyCycleBlock[] } | null> {
  const ctx = await getTodayCycleDay(userId)
  if (!ctx) return null
  const blocks =
    ctx.day.blocks.length > 0
      ? ctx.day.blocks
      : ctx.cycle.cycle_blocks.filter((b) => b.day_index === ctx.day.day_index)
  return { ...ctx, blocks }
}

export async function advanceCycleDayIndex(
  cycleId: string,
  totalDays: number
): Promise<void> {
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

export async function saveManualCycle(
  userId: string,
  input: ManualCycleSaveInput
): Promise<StudyCycle> {
  if (!input.days.length) {
    throw new Error("Adicione ao menos um dia ao ciclo")
  }

  const allSubjectIds = [
    ...new Set(input.days.flatMap((d) => d.blocks.map((b) => b.subject_id))),
  ]

  const { data: existing } = await supabaseServer
    .from("study_cycles")
    .select("id, status")
    .eq("user_id", userId)
    .in("status", ["draft", "paused", "active"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let cycleId = existing?.id
  const total_days = input.days.length
  const weekday_limits = input.weekday_limits ?? defaultWeekdayLimits()

  const maxSubjectsPerDay =
    input.subjects_per_day ??
    Math.max(
      ...input.days.map((d) => new Set(d.blocks.map((b) => b.subject_id)).size),
      1
    )

  if (cycleId) {
    await supabaseServer
      .from("study_cycles")
      .update({
        name: input.name ?? "Meu ciclo",
        subjects_per_day: maxSubjectsPerDay,
        total_days,
        planning_mode: input.planning_mode ?? "time_driven",
        target_weeks: input.target_weeks ?? null,
        default_block_minutes: input.default_block_minutes ?? 45,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cycleId)

    await Promise.all([
      supabaseServer.from("study_cycle_subjects").delete().eq("cycle_id", cycleId),
      supabaseServer.from("study_cycle_weekday_limits").delete().eq("cycle_id", cycleId),
      supabaseServer.from("study_cycle_days").delete().eq("cycle_id", cycleId),
      supabaseServer.from("study_cycle_blocks").delete().eq("cycle_id", cycleId),
    ])
  } else {
    const { data: created, error } = await supabaseServer
      .from("study_cycles")
      .insert({
        user_id: userId,
        status: "draft",
        name: input.name ?? "Meu ciclo",
        subjects_per_day: maxSubjectsPerDay,
        total_days,
        planning_mode: input.planning_mode ?? "time_driven",
        target_weeks: input.target_weeks ?? null,
        default_block_minutes: input.default_block_minutes ?? 45,
      })
      .select("id")
      .single()
    if (error || !created) throw new Error(error?.message ?? "Erro ao criar ciclo")
    cycleId = created.id
  }

  const subjectEntries =
    input.subjects?.length
      ? input.subjects
      : allSubjectIds.map((sid, i) => ({
          subject_id: sid,
          sort_order: i,
          weight: 1,
        }))

  if (subjectEntries.length) {
    await supabaseServer.from("study_cycle_subjects").insert(
      subjectEntries.map((s) => ({
        cycle_id: cycleId,
        subject_id: s.subject_id,
        sort_order: s.sort_order,
        times_in_cycle: Math.min(10, Math.max(1, s.weight)),
      }))
    )
  }

  if (weekday_limits.length) {
    await supabaseServer.from("study_cycle_weekday_limits").insert(
      weekday_limits.map((w) => ({
        cycle_id: cycleId,
        weekday: w.weekday,
        minutes: w.minutes,
        active: w.active,
        daily_limits: w.daily_limits,
      }))
    )
  }

  const dayRows = input.days.map((d) => ({
    cycle_id: cycleId,
    day_index: d.day_index,
    weekday: d.weekday,
    subject_ids: [...new Set(d.blocks.map((b) => b.subject_id))],
    blocks: [],
  }))
  if (dayRows.length) {
    await supabaseServer.from("study_cycle_days").insert(dayRows)
  }

  const blockRows = input.days.flatMap((d) =>
    d.blocks.map((b, sort_order) => ({
      cycle_id: cycleId,
      day_index: d.day_index,
      subject_id: b.subject_id,
      content_node_id: b.content_node_id,
      content_block_id: b.content_block_id ?? null,
      block_type: b.block_type,
      sort_order,
      label: b.label,
      params: b.params ?? {},
    }))
  )
  if (blockRows.length) {
    await supabaseServer.from("study_cycle_blocks").insert(blockRows)
  }

  const cycle = await getActiveOrDraftCycle(userId)
  if (!cycle) throw new Error("Ciclo não encontrado após salvar")
  return cycle
}

export async function activateCycle(
  userId: string,
  cycleId: string
): Promise<StudyCycle> {
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
