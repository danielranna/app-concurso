import type { DailyStudyBlock, DailyStudyPlan } from "../coach-types"
import { fetchDueStates } from "../flashcard-queue"
import { loadMappings } from "../tec-mapping"
import { supabaseServer } from "../supabase-server"
import { topicBrainKey } from "./brain-helpers"
import { searchDocumentChunks } from "./document-rag"

type QueueRow = {
  subject_id: string
  topic_key: string
  topic_label?: string
  priority_score: number
  edital_weight?: number
  subject_priority?: number
  reason?: string | null
}

export function buildBlockKey(block: {
  type: string
  subject_id: string
  params?: Record<string, unknown>
}): string {
  const topic = (block.params?.topic_key as string) ?? "all"
  return `${block.type}:${block.subject_id}:${topic}`
}

export function rankSubjectsByQueue(
  subjectIds: string[],
  queue: QueueRow[],
  excludeIds: string[] = []
): string[] {
  const scores = new Map<
    string,
    {
      maxScore: number
      sumScore: number
      editalWeight: number
      subjectPriority: number
    }
  >()

  for (const item of queue) {
    const sid = item.subject_id
    const ps = Number(item.priority_score)
    const ew = Number(item.edital_weight ?? 1)
    const sp = Number(item.subject_priority ?? 0)
    const cur = scores.get(sid) ?? {
      maxScore: 0,
      sumScore: 0,
      editalWeight: 0,
      subjectPriority: 0,
    }
    cur.maxScore = Math.max(cur.maxScore, ps)
    cur.sumScore += ps
    cur.editalWeight = Math.max(cur.editalWeight, ew)
    if (sp > 0) cur.subjectPriority = Math.max(cur.subjectPriority, sp)
    scores.set(sid, cur)
  }

  const exclude = new Set(excludeIds)
  const pool = subjectIds.filter((id) => !exclude.has(id))
  const sorted = (pool.length > 0 ? pool : subjectIds).sort((a, b) => {
    const sa = scores.get(a) ?? {
      maxScore: 0,
      sumScore: 0,
      editalWeight: 0,
      subjectPriority: 0,
    }
    const sb = scores.get(b) ?? {
      maxScore: 0,
      sumScore: 0,
      editalWeight: 0,
      subjectPriority: 0,
    }
    if (sb.subjectPriority !== sa.subjectPriority) {
      return sb.subjectPriority - sa.subjectPriority
    }
    if (sb.maxScore !== sa.maxScore) return sb.maxScore - sa.maxScore
    if (sb.sumScore !== sa.sumScore) return sb.sumScore - sa.sumScore
    if (sb.editalWeight !== sa.editalWeight) return sb.editalWeight - sa.editalWeight
    return a.localeCompare(b)
  })

  return sorted
}

export function topQueueReasonForSubject(
  queue: QueueRow[],
  subjectId: string
): string | undefined {
  const items = queue
    .filter((q) => q.subject_id === subjectId)
    .sort((a, b) => Number(b.priority_score) - Number(a.priority_score))
  return items[0]?.reason ?? undefined
}

type WrongReviewRow = {
  attempt_id: string
  question_id: string
  tec_topic: string
  error_taxonomy: string | null
}

export async function pickClassifiedWrongAttempts(
  userId: string,
  subjectId: string,
  options?: { topicKey?: string; limit?: number }
): Promise<WrongReviewRow[]> {
  const limit = Math.min(options?.limit ?? 10, 30)
  const mappings = await loadMappings(userId)
  const tecSubjects = new Set(
    mappings
      .filter((m) => m.subject_id === subjectId)
      .map((m) => (m.tec_subject ?? "").trim())
      .filter(Boolean)
  )

  const { data: attempts, error } = await supabaseServer
    .from("question_attempts")
    .select(
      `
      id, question_id, error_taxonomy, created_at,
      questions ( tec_subject, tec_topic )
    `
    )
    .eq("user_id", userId)
    .eq("is_correct", false)
    .not("error_taxonomy", "is", null)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)

  const topicNorm = options?.topicKey
    ? topicBrainKey(options.topicKey)
    : null
  const seenQ = new Set<string>()
  const rows: WrongReviewRow[] = []

  for (const a of attempts ?? []) {
    if (seenQ.has(a.question_id)) continue
    const q = a.questions as
      | { tec_subject?: string; tec_topic?: string }
      | { tec_subject?: string; tec_topic?: string }[]
    const qu = Array.isArray(q) ? q[0] : q
    if (!qu || !tecSubjects.has((qu.tec_subject ?? "").trim())) continue

    const topic = (qu.tec_topic ?? "").trim()
    if (topicNorm && topicBrainKey(topic) !== topicNorm) continue

    seenQ.add(a.question_id)
    rows.push({
      attempt_id: a.id,
      question_id: a.question_id,
      tec_topic: topic || "Sem tópico",
      error_taxonomy: a.error_taxonomy as string,
    })
    if (rows.length >= limit) break
  }

  return rows
}

export async function pickDueFlashcardStateIds(
  userId: string,
  subjectIds: string[],
  limit: number
): Promise<{ stateIds: string[]; bySubject: Record<string, number> }> {
  const stateIds: string[] = []
  const bySubject: Record<string, number> = {}
  let remaining = limit

  for (const subjectId of subjectIds) {
    if (remaining <= 0) break
    const rows = await fetchDueStates(userId, {
      subjectId,
      dueNowOnly: true,
      includeNew: true,
    })
    const take = rows.slice(0, remaining)
    bySubject[subjectId] = take.length
    for (const r of take) {
      stateIds.push(r.id)
      remaining--
      if (remaining <= 0) break
    }
  }

  if (stateIds.length < limit && subjectIds.length > 0) {
    const rows = await fetchDueStates(userId, { dueNowOnly: true, includeNew: true })
    for (const r of rows) {
      if (stateIds.includes(r.id)) continue
      stateIds.push(r.id)
      if (stateIds.length >= limit) break
    }
  }

  return { stateIds, bySubject }
}

export async function buildSummaryBlocks(
  userId: string,
  pickedSubjects: string[],
  queue: QueueRow[],
  queueBySubject: Map<string, QueueRow[]>,
  summariesBudget: number,
  subjectNames: Map<string, string>
): Promise<DailyStudyBlock[]> {
  const blocks: DailyStudyBlock[] = []
  let budget = summariesBudget

  for (const subjectId of pickedSubjects) {
    if (budget <= 0) break
    const candidates = (queueBySubject.get(subjectId) ?? []).slice(0, 3)
    let selectedTop: QueueRow | undefined
    let selectedChunk:
      | Awaited<ReturnType<typeof searchDocumentChunks>>[number]
      | undefined
    for (const top of candidates) {
      const topicKey = top?.topic_key
      const searchQuery = top?.topic_label ?? topicKey
      if (!searchQuery) continue
      const chunks = await searchDocumentChunks(userId, subjectId, searchQuery, 1)
      if (!chunks.length) continue
      selectedTop = top
      selectedChunk = chunks[0]
      break
    }
    if (!selectedTop || !selectedChunk) continue

    const topicKey = selectedTop.topic_key
    blocks.push({
      subject_id: subjectId,
      subject_name: subjectNames.get(subjectId),
      type: "read_material",
      count: 1,
      minutes: 15,
      label: `Leitura: ${selectedChunk.title}`,
      params: {
        block_key: `read_material:${subjectId}:${topicKey}`,
        topic_key: topicKey,
        document_id: selectedChunk.document_id,
        material_title: selectedChunk.title,
        excerpt: selectedChunk.content.slice(0, 400),
        queue_reason: selectedTop.reason ?? undefined,
      },
    })
    budget--
  }

  return blocks
}

export function planRowToDailyStudyPlan(row: {
  id: string
  plan_date: string
  mode: string
  limits: unknown
  blocks: unknown
  rotation_note?: string | null
  narrative_summary?: string | null
  combined_notebook_id?: string | null
  user_pinned?: boolean
}): {
  id: string
  date: string
  mode: "pre_edital" | "pos_edital" | "reta_final"
  limits: DailyStudyPlan["limits"]
  blocks: DailyStudyBlock[]
  rotation_note?: string
  narrative_summary?: string
  combined_notebook_id: string | null
  combined_question_count: number
  user_pinned?: boolean
} {
  const limits = (row.limits ?? {}) as Record<string, unknown> & {
    questions?: number
    flashcards?: number
    summaries?: number
    error_reviews?: number
  }
  const blocks = (row.blocks ?? []) as DailyStudyBlock[]
  const combinedFromLimits = limits.combined_notebook_id as string | undefined

  return {
    id: row.id,
    date: String(row.plan_date).slice(0, 10),
    mode: row.mode as "pre_edital" | "pos_edital" | "reta_final",
    limits: {
      questions: Number(limits.questions ?? 50),
      flashcards: Number(limits.flashcards ?? 20),
      summaries: Number(limits.summaries ?? 2),
      error_reviews: Number(limits.error_reviews ?? 10),
    },
    blocks,
    rotation_note: row.rotation_note ?? undefined,
    narrative_summary: row.narrative_summary ?? undefined,
    combined_notebook_id:
      row.combined_notebook_id ?? combinedFromLimits ?? null,
    combined_question_count: blocks
      .filter((b) => b.type === "questions" && b.params?.is_combined)
      .reduce((s, b) => s + b.count, 0),
    user_pinned: row.user_pinned ?? false,
  }
}
