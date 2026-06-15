import { supabaseServer } from "./supabase-server"
import type {
  StudyCycleContentBlock,
  StudyCycleContentBlockTopic,
} from "./study-cycle-types"

export async function loadContentBlocksForCycle(
  cycleId: string
): Promise<StudyCycleContentBlock[]> {
  const { data: blockRows } = await supabaseServer
    .from("study_cycle_content_blocks")
    .select("*, subjects(name)")
    .eq("cycle_id", cycleId)
    .order("sort_order")

  if (!blockRows?.length) return []

  const blockIds = blockRows.map((b) => b.id)
  const { data: topicRows } = await supabaseServer
    .from("study_cycle_content_block_topics")
    .select("*")
    .in("content_block_id", blockIds)
    .order("sort_order")

  const topicsByBlock = new Map<string, StudyCycleContentBlockTopic[]>()
  for (const t of topicRows ?? []) {
    const list = topicsByBlock.get(t.content_block_id) ?? []
    list.push({
      id: t.id,
      content_block_id: t.content_block_id,
      tec_subject: t.tec_subject,
      tec_topic: t.tec_topic ?? "",
      sort_order: t.sort_order,
    })
    topicsByBlock.set(t.content_block_id, list)
  }

  return blockRows.map((b) => {
    const sub = b.subjects as { name?: string } | { name?: string }[] | null
    const name = Array.isArray(sub) ? sub[0]?.name : sub?.name
    return {
      id: b.id,
      cycle_id: b.cycle_id,
      subject_id: b.subject_id,
      name: b.name,
      sort_order: b.sort_order,
      estimated_minutes: b.estimated_minutes ?? 45,
      topics: topicsByBlock.get(b.id) ?? [],
      subject_name: name,
    }
  })
}

export async function getContentBlock(
  userId: string,
  blockId: string
): Promise<StudyCycleContentBlock | null> {
  const { data: b } = await supabaseServer
    .from("study_cycle_content_blocks")
    .select("*, study_cycles!inner(user_id), subjects(name)")
    .eq("id", blockId)
    .eq("study_cycles.user_id", userId)
    .maybeSingle()

  if (!b) return null

  const { data: topics } = await supabaseServer
    .from("study_cycle_content_block_topics")
    .select("*")
    .eq("content_block_id", blockId)
    .order("sort_order")

  const sub = b.subjects as { name?: string } | { name?: string }[] | null
  const subName = Array.isArray(sub) ? sub[0]?.name : sub?.name

  return {
    id: b.id,
    cycle_id: b.cycle_id,
    subject_id: b.subject_id,
    name: b.name,
    sort_order: b.sort_order,
    estimated_minutes: b.estimated_minutes ?? 45,
    topics: (topics ?? []).map((t) => ({
      id: t.id,
      content_block_id: t.content_block_id,
      tec_subject: t.tec_subject,
      tec_topic: t.tec_topic ?? "",
      sort_order: t.sort_order,
    })),
    subject_name: subName,
  }
}

export async function createContentBlock(
  cycleId: string,
  subjectId: string,
  name: string,
  sortOrder: number,
  estimatedMinutes = 45
): Promise<StudyCycleContentBlock> {
  const { data, error } = await supabaseServer
    .from("study_cycle_content_blocks")
    .insert({
      cycle_id: cycleId,
      subject_id: subjectId,
      name,
      sort_order: sortOrder,
      estimated_minutes: estimatedMinutes,
    })
    .select("id, cycle_id, subject_id, name, sort_order, estimated_minutes")
    .single()

  if (error || !data) throw new Error(error?.message ?? "Erro ao criar bloco")

  return {
    ...data,
    topics: [],
  }
}

export async function updateContentBlock(
  blockId: string,
  patch: {
    name?: string
    sort_order?: number
    estimated_minutes?: number
  }
): Promise<void> {
  const { error } = await supabaseServer
    .from("study_cycle_content_blocks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", blockId)
  if (error) throw new Error(error.message)
}

export async function deleteContentBlock(blockId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("study_cycle_content_blocks")
    .delete()
    .eq("id", blockId)
  if (error) throw new Error(error.message)
}

export async function addTopicToContentBlock(
  blockId: string,
  tecSubject: string,
  tecTopic: string,
  sortOrder: number
): Promise<StudyCycleContentBlockTopic> {
  const { data, error } = await supabaseServer
    .from("study_cycle_content_block_topics")
    .upsert(
      {
        content_block_id: blockId,
        tec_subject: tecSubject,
        tec_topic: tecTopic,
        sort_order: sortOrder,
      },
      { onConflict: "content_block_id,tec_subject,tec_topic" }
    )
    .select("*")
    .single()

  if (error || !data) throw new Error(error?.message ?? "Erro ao adicionar assunto")
  return {
    id: data.id,
    content_block_id: data.content_block_id,
    tec_subject: data.tec_subject,
    tec_topic: data.tec_topic ?? "",
    sort_order: data.sort_order,
  }
}

export async function removeTopicFromContentBlock(topicId: string): Promise<void> {
  const { error } = await supabaseServer
    .from("study_cycle_content_block_topics")
    .delete()
    .eq("id", topicId)
  if (error) throw new Error(error.message)
}

export async function saveCycleSubjects(
  cycleId: string,
  subjects: { subject_id: string; sort_order: number; weight: number }[]
): Promise<void> {
  await supabaseServer.from("study_cycle_subjects").delete().eq("cycle_id", cycleId)
  if (subjects.length) {
    await supabaseServer.from("study_cycle_subjects").insert(
      subjects.map((s) => ({
        cycle_id: cycleId,
        subject_id: s.subject_id,
        sort_order: s.sort_order,
        times_in_cycle: Math.min(10, Math.max(1, s.weight)),
      }))
    )
  }
}

export async function ensureDraftCycle(userId: string): Promise<string> {
  const { data: existing } = await supabaseServer
    .from("study_cycles")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["draft", "paused"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { defaultWeekdayLimits } = await import("./study-cycle-planner")
  const limits = defaultWeekdayLimits()

  const { data: created, error } = await supabaseServer
    .from("study_cycles")
    .insert({
      user_id: userId,
      status: "draft",
      name: "Meu ciclo",
      subjects_per_day: 2,
      total_days: 0,
      planning_mode: "deadline_driven",
      default_block_minutes: 45,
    })
    .select("id")
    .single()

  if (error || !created) throw new Error(error?.message ?? "Erro ao criar ciclo")

  await supabaseServer.from("study_cycle_weekday_limits").insert(
    limits.map((w) => ({
      cycle_id: created.id,
      weekday: w.weekday,
      minutes: w.minutes,
      active: w.active,
      daily_limits: w.daily_limits,
    }))
  )

  return created.id
}

export async function getTecTopicsForSubject(
  userId: string,
  subjectId: string
): Promise<{ tec_subject: string; tec_topic: string; question_count?: number }[]> {
  const { data: mappings } = await supabaseServer
    .from("tec_taxonomy_mappings")
    .select("tec_subject, tec_topic")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)

  if (!mappings?.length) return []

  const subjectMappings = mappings.filter((m) => !m.tec_topic)
  const topicMappings = mappings.filter((m) => m.tec_topic)

  const topics: { tec_subject: string; tec_topic: string }[] = []

  for (const tm of topicMappings) {
    topics.push({ tec_subject: tm.tec_subject, tec_topic: tm.tec_topic })
  }

  for (const sm of subjectMappings) {
    const { data: questions } = await supabaseServer
      .from("questions")
      .select("tec_topic")
      .eq("tec_subject", sm.tec_subject)
      .not("tec_topic", "is", null)

    const seen = new Set<string>()
    for (const q of questions ?? []) {
      const t = (q.tec_topic ?? "").trim()
      if (!t || seen.has(t)) continue
      seen.add(t)
      if (!topics.some((x) => x.tec_subject === sm.tec_subject && x.tec_topic === t)) {
        topics.push({ tec_subject: sm.tec_subject, tec_topic: t })
      }
    }
  }

  return topics.sort((a, b) =>
    a.tec_subject.localeCompare(b.tec_subject) || a.tec_topic.localeCompare(b.tec_topic)
  )
}
