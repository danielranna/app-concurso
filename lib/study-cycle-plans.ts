import { supabaseServer } from "./supabase-server"
import { loadContentBlocksForCycle } from "./study-cycle-content-blocks-db"
import {
  generateFullCycle,
  type SubjectPlanInput,
} from "./study-cycle-deadline-planner"
import { defaultWeekdayLimits, normalizeWeekdayLimits } from "./study-cycle-planner"
import { initialQueuePositions } from "./study-cycle-queue"
import type { StudyCycle, StudyCycleBlock, StudyCycleStatus } from "./study-cycle-types"

export type CyclePlanSummary = {
  id: string
  name: string
  status: StudyCycleStatus
  description: string | null
  subject_count: number
  content_block_count: number
  schedule_block_count: number
  completed_count: number
  pending_count: number
  progress_pct: number
  has_schedule: boolean
  updated_at: string
  created_at: string
}

export type SetupDrift = {
  has_drift: boolean
  reasons: string[]
  pending_schedule_blocks: number
  completed_schedule_blocks: number
}

function sessionCalendarLabel(block: {
  name: string
  study_note?: string | null
}): string {
  const note = block.study_note?.trim()
  if (!note) return block.name
  const combined = `${block.name} — ${note}`
  return combined.length > 140 ? `${combined.slice(0, 137)}…` : combined
}

export async function listUserCyclePlans(
  userId: string
): Promise<CyclePlanSummary[]> {
  const { data: rows } = await supabaseServer
    .from("study_cycles")
    .select("id, name, status, description, total_days, updated_at, created_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })

  if (!rows?.length) return []

  const ids = rows.map((r) => r.id)
  const [{ data: subRows }, { data: blockRows }, { data: contentRows }] =
    await Promise.all([
      supabaseServer
        .from("study_cycle_subjects")
        .select("cycle_id")
        .in("cycle_id", ids),
      supabaseServer
        .from("study_cycle_blocks")
        .select("cycle_id, status")
        .in("cycle_id", ids),
      supabaseServer
        .from("study_cycle_content_blocks")
        .select("cycle_id")
        .in("cycle_id", ids),
    ])

  const subjectCount = new Map<string, number>()
  for (const r of subRows ?? []) {
    subjectCount.set(r.cycle_id, (subjectCount.get(r.cycle_id) ?? 0) + 1)
  }

  const contentCount = new Map<string, number>()
  for (const r of contentRows ?? []) {
    contentCount.set(r.cycle_id, (contentCount.get(r.cycle_id) ?? 0) + 1)
  }

  const scheduleStats = new Map<
    string,
    { total: number; completed: number; pending: number }
  >()
  for (const r of blockRows ?? []) {
    const s = scheduleStats.get(r.cycle_id) ?? {
      total: 0,
      completed: 0,
      pending: 0,
    }
    s.total++
    if (r.status === "completed") s.completed++
    else s.pending++
    scheduleStats.set(r.cycle_id, s)
  }

  return rows.map((r) => {
    const stats = scheduleStats.get(r.id) ?? {
      total: 0,
      completed: 0,
      pending: 0,
    }
    const progress_pct =
      stats.total > 0
        ? Math.round((stats.completed / stats.total) * 100)
        : 0
    return {
      id: r.id,
      name: r.name,
      status: r.status as StudyCycleStatus,
      description: (r.description as string | null) ?? null,
      subject_count: subjectCount.get(r.id) ?? 0,
      content_block_count: contentCount.get(r.id) ?? 0,
      schedule_block_count: stats.total,
      completed_count: stats.completed,
      pending_count: stats.pending,
      progress_pct,
      has_schedule: stats.total > 0,
      updated_at: r.updated_at,
      created_at: r.created_at,
    }
  })
}

export async function createEmptyCyclePlan(
  userId: string,
  name: string,
  description?: string | null
): Promise<string> {
  const limits = defaultWeekdayLimits()
  const { data, error } = await supabaseServer
    .from("study_cycles")
    .insert({
      user_id: userId,
      status: "draft",
      name: name.trim() || "Novo plano",
      description: description?.trim() || null,
      subjects_per_day: 2,
      total_days: 0,
      planning_mode: "deadline_driven",
      default_block_minutes: 45,
    })
    .select("id")
    .single()

  if (error || !data) throw new Error(error?.message ?? "Erro ao criar plano")

  await supabaseServer.from("study_cycle_weekday_limits").insert(
    limits.map((w) => ({
      cycle_id: data.id,
      weekday: w.weekday,
      minutes: w.minutes,
      active: w.active,
      daily_limits: w.daily_limits,
    }))
  )

  return data.id
}

export async function duplicateCyclePlan(
  userId: string,
  sourceCycleId: string,
  name?: string
): Promise<string> {
  const { data: source } = await supabaseServer
    .from("study_cycles")
    .select("*")
    .eq("id", sourceCycleId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!source) throw new Error("Plano origem não encontrado")

  const newId = await createEmptyCyclePlan(
    userId,
    name?.trim() || `${source.name} (cópia)`,
    source.description as string | null
  )

  await supabaseServer
    .from("study_cycles")
    .update({
      planning_mode: source.planning_mode,
      target_weeks: source.target_weeks,
      default_block_minutes: source.default_block_minutes,
      subjects_per_day: source.subjects_per_day,
    })
    .eq("id", newId)

  const { data: subs } = await supabaseServer
    .from("study_cycle_subjects")
    .select("*")
    .eq("cycle_id", sourceCycleId)

  if (subs?.length) {
    await supabaseServer.from("study_cycle_subjects").insert(
      subs.map((s) => ({
        cycle_id: newId,
        subject_id: s.subject_id,
        sort_order: s.sort_order,
        times_in_cycle: s.times_in_cycle,
      }))
    )
  }

  const { data: limits } = await supabaseServer
    .from("study_cycle_weekday_limits")
    .select("*")
    .eq("cycle_id", sourceCycleId)

  if (limits?.length) {
    await supabaseServer.from("study_cycle_weekday_limits").delete().eq("cycle_id", newId)
    await supabaseServer.from("study_cycle_weekday_limits").insert(
      limits.map((w) => ({
        cycle_id: newId,
        weekday: w.weekday,
        minutes: w.minutes,
        active: w.active,
        max_blocks: w.max_blocks,
        daily_limits: w.daily_limits,
      }))
    )
  }

  const contentBlocks = await loadContentBlocksForCycle(sourceCycleId)
  for (const block of contentBlocks) {
    const { data: created } = await supabaseServer
      .from("study_cycle_content_blocks")
      .insert({
        cycle_id: newId,
        subject_id: block.subject_id,
        name: block.name,
        sort_order: block.sort_order,
        estimated_minutes: block.estimated_minutes,
        study_note: block.study_note,
        notebook_id: block.notebook_id,
        phase_label: (block as { phase_label?: string | null }).phase_label ?? null,
      })
      .select("id")
      .single()

    if (!created?.id || !block.topics.length) continue

    await supabaseServer.from("study_cycle_content_block_topics").insert(
      block.topics.map((t) => ({
        content_block_id: created.id,
        tec_subject: t.tec_subject,
        tec_topic: t.tec_topic,
        sort_order: t.sort_order,
      }))
    )
  }

  return newId
}

export async function renameCyclePlan(
  cycleId: string,
  userId: string,
  name: string,
  description?: string | null
): Promise<void> {
  const { error } = await supabaseServer
    .from("study_cycles")
    .update({
      name: name.trim() || "Plano",
      description: description !== undefined ? description : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cycleId)
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
}

export async function archiveCyclePlan(
  cycleId: string,
  userId: string
): Promise<void> {
  const { error } = await supabaseServer
    .from("study_cycles")
    .update({
      status: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", cycleId)
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
}

export async function pauseCyclePlan(
  cycleId: string,
  userId: string
): Promise<void> {
  const { error } = await supabaseServer
    .from("study_cycles")
    .update({
      status: "paused",
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", cycleId)
    .eq("user_id", userId)
    .eq("status", "active")

  if (error) throw new Error(error.message)
}

export async function detectSetupDrift(cycle: StudyCycle): Promise<SetupDrift> {
  const reasons: string[] = []
  const contentBlocks = cycle.content_blocks ?? []
  const scheduleBlocks = cycle.cycle_blocks ?? []

  if (!scheduleBlocks.length) {
    return {
      has_drift: false,
      reasons: [],
      pending_schedule_blocks: 0,
      completed_schedule_blocks: 0,
    }
  }

  const contentIds = new Set(contentBlocks.map((b) => b.id))
  const scheduledContentIds = new Set(
    scheduleBlocks
      .map((b) => b.content_block_id)
      .filter(Boolean) as string[]
  )

  for (const id of contentIds) {
    if (!scheduledContentIds.has(id)) {
      reasons.push("Há blocos de conteúdo novos sem sessões no calendário.")
      break
    }
  }

  for (const id of scheduledContentIds) {
    if (!contentIds.has(id)) {
      reasons.push("O calendário referencia blocos de conteúdo removidos.")
      break
    }
  }

  const subjectIds = new Set(cycle.subjects.map((s) => s.subject_id))
  const scheduledSubjects = new Set(scheduleBlocks.map((b) => b.subject_id))
  for (const sid of subjectIds) {
    if (!scheduledSubjects.has(sid)) {
      reasons.push("Há matérias novas sem sessões no calendário.")
      break
    }
  }

  const contentById = new Map(contentBlocks.map((b) => [b.id, b]))
  let labelDrift = false
  for (const sb of scheduleBlocks.filter((b) => b.status !== "completed")) {
    if (!sb.content_block_id) continue
    const cb = contentById.get(sb.content_block_id)
    if (!cb) continue
    const expected = sessionCalendarLabel(cb)
    const notebookId = cb.notebook_id ?? undefined
    const paramNotebook = sb.params?.notebook_id
    if (
      sb.label !== expected ||
      (notebookId ?? null) !== (paramNotebook ?? null)
    ) {
      labelDrift = true
      break
    }
  }
  if (labelDrift) {
    reasons.push("Blocos pendentes têm rótulos ou cadernos desatualizados.")
  }

  const completed = scheduleBlocks.filter((b) => b.status === "completed").length
  const pending = scheduleBlocks.length - completed

  return {
    has_drift: reasons.length > 0,
    reasons: [...new Set(reasons)],
    pending_schedule_blocks: pending,
    completed_schedule_blocks: completed,
  }
}

export async function syncScheduleFromContent(
  cycleId: string,
  userId: string
): Promise<{ updated: number }> {
  const { data: cycleRow } = await supabaseServer
    .from("study_cycles")
    .select("id")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!cycleRow) throw new Error("Plano não encontrado")

  const contentBlocks = await loadContentBlocksForCycle(cycleId)
  const contentById = new Map(contentBlocks.map((b) => [b.id, b]))

  const { data: pendingRows } = await supabaseServer
    .from("study_cycle_blocks")
    .select("id, content_block_id, params, label, block_type")
    .eq("cycle_id", cycleId)
    .eq("status", "pending")

  let updated = 0
  for (const row of pendingRows ?? []) {
    if (!row.content_block_id) continue
    const cb = contentById.get(row.content_block_id)
    if (!cb) continue

    const manual = cb.topics.length === 0 && Boolean(cb.study_note?.trim())
    const label = sessionCalendarLabel(cb)
    const params = {
      ...((row.params ?? {}) as StudyCycleBlock["params"]),
      study_note: manual ? cb.study_note?.trim() : undefined,
      notebook_id: cb.notebook_id ?? undefined,
    }

    const { error } = await supabaseServer
      .from("study_cycle_blocks")
      .update({
        label,
        block_type: manual ? "read" : "questions",
        params,
      })
      .eq("id", row.id)

    if (!error) updated++
  }

  await supabaseServer
    .from("study_cycles")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", cycleId)

  return { updated }
}

export async function appendNewSessions(
  cycleId: string,
  userId: string
): Promise<{ added: number }> {
  const { data: cycleRow } = await supabaseServer
    .from("study_cycles")
    .select("*")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!cycleRow) throw new Error("Plano não encontrado")

  const [{ data: subRows }, contentBlocks, { data: scheduleRows }] =
    await Promise.all([
      supabaseServer
        .from("study_cycle_subjects")
        .select("subject_id, sort_order, times_in_cycle, subjects(name)")
        .eq("cycle_id", cycleId)
        .order("sort_order"),
      loadContentBlocksForCycle(cycleId),
      supabaseServer
        .from("study_cycle_blocks")
        .select("id, content_block_id, subject_id, day_index, sort_order, queue_position, params")
        .eq("cycle_id", cycleId),
    ])

  const subjects: SubjectPlanInput[] = (subRows ?? []).map((r) => {
    const sub = r.subjects as { name?: string } | { name?: string }[] | null
    const name = Array.isArray(sub) ? sub[0]?.name : sub?.name
    return {
      subject_id: r.subject_id,
      subject_name: name,
      weight: r.times_in_cycle,
      blocks: contentBlocks.filter((b) => b.subject_id === r.subject_id),
    }
  })

  const { data: wdRows } = await supabaseServer
    .from("study_cycle_weekday_limits")
    .select("*")
    .eq("cycle_id", cycleId)

  const limits = normalizeWeekdayLimits(
    (wdRows ?? []).map((r) => ({
      weekday: r.weekday,
      minutes: r.minutes,
      active: r.active,
      max_blocks: r.max_blocks != null ? Number(r.max_blocks) : null,
      daily_limits: r.daily_limits,
    }))
  )

  const generated = generateFullCycle({
    subjects,
    weekday_limits: limits,
    target_weeks: Number(cycleRow.target_weeks ?? 8),
    default_block_minutes: Number(cycleRow.default_block_minutes ?? 45),
    subjects_per_day: Number(cycleRow.subjects_per_day ?? 2),
    planning_mode: "deadline_driven",
  })

  const existingKeys = new Set<string>()
  for (const row of scheduleRows ?? []) {
    if (!row.content_block_id) continue
    const pass = (row.params as { block_pass?: number })?.block_pass ?? 1
    const mc =
      (row.params as { mini_cycle_index?: number })?.mini_cycle_index ?? 0
    existingKeys.add(`${row.content_block_id}:${pass}:${mc}`)
  }

  const newBlocks: {
    cycle_id: string
    day_index: number
    subject_id: string
    content_block_id: string
    block_type: string
    sort_order: number
    label: string
    params: Record<string, unknown>
  }[] = []

  let maxDay = Math.max(
    0,
    ...(scheduleRows ?? []).map((r) => r.day_index),
    Number(cycleRow.total_days ?? 0) - 1
  )
  let maxQueue = Math.max(
    0,
    ...(scheduleRows ?? []).map((r) => Number(r.queue_position ?? 0))
  )

  const flatNew: typeof newBlocks = []

  for (const day of generated.days) {
    for (const block of day.blocks) {
      if (!block.content_block_id) continue
      const pass = block.params?.block_pass ?? 1
      const mc = block.params?.mini_cycle_index ?? 0
      const key = `${block.content_block_id}:${pass}:${mc}`
      if (existingKeys.has(key)) continue

      maxDay++
      maxQueue++
      flatNew.push({
        cycle_id: cycleId,
        day_index: maxDay,
        subject_id: block.subject_id,
        content_block_id: block.content_block_id,
        block_type: block.block_type,
        sort_order: 0,
        label: block.label,
        params: block.params ?? {},
      })
      existingKeys.add(key)
    }
  }

  if (!flatNew.length) return { added: 0 }

  await supabaseServer.from("study_cycle_blocks").insert(
    flatNew.map((b, i) => ({
      ...b,
      queue_position: maxQueue - flatNew.length + i + 1,
      status: "pending",
    }))
  )

  await supabaseServer
    .from("study_cycles")
    .update({
      total_days: maxDay + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cycleId)

  return { added: flatNew.length }
}
