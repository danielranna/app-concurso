import { supabaseServer } from "./supabase-server"

const DOMINANCE_THRESHOLD = 0.8

type TopicAgg = {
  tec_subject: string
  tec_topic: string
  count: number
}

export async function detectNotebookDominantTopic(
  notebookId: string
): Promise<TopicAgg | null> {
  const { data: rows, error } = await supabaseServer
    .from("notebook_questions")
    .select("questions ( tec_subject, tec_topic )")
    .eq("notebook_id", notebookId)

  if (error || !rows?.length) return null

  const counts = new Map<string, TopicAgg>()
  let total = 0

  for (const row of rows) {
    const q = row.questions as
      | { tec_subject?: string; tec_topic?: string }
      | { tec_subject?: string; tec_topic?: string }[]
      | null
    const qu = Array.isArray(q) ? q[0] : q
    const tec_subject = (qu?.tec_subject ?? "").trim()
    const tec_topic = (qu?.tec_topic ?? "").trim()
    if (!tec_subject || !tec_topic) continue
    total++
    const key = `${tec_subject}\0${tec_topic}`
    const prev = counts.get(key)
    if (prev) prev.count++
    else counts.set(key, { tec_subject, tec_topic, count: 1 })
  }

  if (total === 0) return null

  let best: TopicAgg | null = null
  for (const agg of counts.values()) {
    if (!best || agg.count > best.count) best = agg
  }
  if (!best || best.count / total < DOMINANCE_THRESHOLD) return null
  return best
}

/** Caderno estilo índice: 1 questão por assunto (muitos tópicos distintos). */
export async function listNotebookUniqueTopics(
  notebookId: string
): Promise<TopicAgg[]> {
  const { data: rows, error } = await supabaseServer
    .from("notebook_questions")
    .select("questions ( tec_subject, tec_topic )")
    .eq("notebook_id", notebookId)

  if (error || !rows?.length) return []

  const counts = new Map<string, TopicAgg>()
  for (const row of rows) {
    const q = row.questions as
      | { tec_subject?: string; tec_topic?: string }
      | { tec_subject?: string; tec_topic?: string }[]
      | null
    const qu = Array.isArray(q) ? q[0] : q
    const tec_subject = (qu?.tec_subject ?? "").trim()
    const tec_topic = (qu?.tec_topic ?? "").trim()
    if (!tec_subject || !tec_topic) continue
    const key = `${tec_subject}\0${tec_topic}`
    const prev = counts.get(key)
    if (prev) prev.count++
    else counts.set(key, { tec_subject, tec_topic, count: 1 })
  }
  return [...counts.values()]
}

function isIndexStyleNotebook(topics: TopicAgg[], total: number): boolean {
  if (total < 3 || topics.length < 3) return false
  return topics.length / total >= 0.5
}

async function upsertTopicNode(
  userId: string,
  subjectId: string,
  notebookId: string,
  agg: TopicAgg
): Promise<string | null> {
  const now = new Date().toISOString()
  const { data: existing } = await supabaseServer
    .from("subject_content_nodes")
    .select("id")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .eq("node_type", "topic")
    .eq("tec_subject", agg.tec_subject)
    .eq("tec_topic", agg.tec_topic)
    .maybeSingle()

  if (existing) {
    await supabaseServer
      .from("subject_content_nodes")
      .update({
        notebook_id: notebookId,
        question_count: agg.count,
        name: agg.tec_topic,
        synced_at: now,
        updated_at: now,
      })
      .eq("id", existing.id)
    return existing.id
  }

  const { data: maxSort } = await supabaseServer
    .from("subject_content_nodes")
    .select("sort_order")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .is("parent_id", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: created, error } = await supabaseServer
    .from("subject_content_nodes")
    .insert({
      user_id: userId,
      subject_id: subjectId,
      parent_id: null,
      node_type: "topic",
      name: agg.tec_topic,
      tec_subject: agg.tec_subject,
      tec_topic: agg.tec_topic,
      notebook_id: notebookId,
      sort_order: (maxSort?.sort_order ?? -1) + 1,
      question_count: agg.count,
      synced_at: now,
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  return created?.id ?? null
}

async function syncIndexStyleNotebook(
  userId: string,
  notebookId: string,
  subjectId: string
): Promise<{ synced: number; node_id: string | null }> {
  const topics = await listNotebookUniqueTopics(notebookId)
  const { count: total } = await supabaseServer
    .from("notebook_questions")
    .select("id", { count: "exact", head: true })
    .eq("notebook_id", notebookId)

  if (!isIndexStyleNotebook(topics, total ?? 0)) {
    return { synced: 0, node_id: null }
  }

  let synced = 0
  let firstId: string | null = null
  for (const agg of topics) {
    const id = await upsertTopicNode(userId, subjectId, notebookId, agg)
    if (id) {
      synced++
      if (!firstId) firstId = id
    }
  }
  return { synced, node_id: firstId }
}

export async function syncNotebookToContentIndex(
  userId: string,
  notebookId: string,
  subjectId: string
): Promise<{ created: boolean; updated: boolean; node_id: string | null }> {
  const dominant = await detectNotebookDominantTopic(notebookId)
  if (!dominant) {
    const indexSync = await syncIndexStyleNotebook(userId, notebookId, subjectId)
    if (indexSync.synced > 0) {
      return {
        created: true,
        updated: false,
        node_id: indexSync.node_id,
      }
    }
    return { created: false, updated: false, node_id: null }
  }

  const { count } = await supabaseServer
    .from("notebook_questions")
    .select("id", { count: "exact", head: true })
    .eq("notebook_id", notebookId)

  const question_count = count ?? dominant.count
  const now = new Date().toISOString()

  const { data: existing } = await supabaseServer
    .from("subject_content_nodes")
    .select("id, notebook_id")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .eq("node_type", "topic")
    .eq("tec_subject", dominant.tec_subject)
    .eq("tec_topic", dominant.tec_topic)
    .maybeSingle()

  if (existing) {
    await supabaseServer
      .from("subject_content_nodes")
      .update({
        notebook_id: notebookId,
        question_count,
        name: dominant.tec_topic,
        synced_at: now,
        updated_at: now,
      })
      .eq("id", existing.id)
    return {
      created: false,
      updated: true,
      node_id: existing.id,
    }
  }

  const { data: maxSort } = await supabaseServer
    .from("subject_content_nodes")
    .select("sort_order")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .is("parent_id", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = (maxSort?.sort_order ?? -1) + 1

  const { data: created, error } = await supabaseServer
    .from("subject_content_nodes")
    .insert({
      user_id: userId,
      subject_id: subjectId,
      parent_id: null,
      node_type: "topic",
      name: dominant.tec_topic,
      tec_subject: dominant.tec_subject,
      tec_topic: dominant.tec_topic,
      notebook_id: notebookId,
      sort_order,
      question_count,
      synced_at: now,
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  return { created: true, updated: false, node_id: created?.id ?? null }
}

export async function syncSubjectContentIndex(
  userId: string,
  subjectId: string
): Promise<{ synced: number; skipped: number }> {
  const { data: notebooks } = await supabaseServer
    .from("notebooks")
    .select("id")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)

  let synced = 0
  let skipped = 0

  for (const nb of notebooks ?? []) {
    const result = await syncNotebookToContentIndex(userId, nb.id, subjectId)
    if (result.node_id) synced++
    else skipped++
  }

  return { synced, skipped }
}
