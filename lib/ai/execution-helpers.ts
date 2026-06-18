import type { DailyStudyBlock, DailyStudyPlan, PlanGenerationMeta } from "../coach-types"
import { fetchDueStates } from "../flashcard-queue"
import { ensureSubjectDecks } from "../flashcard-subjects"
import { loadMappings, resolveQuestionMapping } from "../tec-mapping"
import { supabaseServer } from "../supabase-server"
import { topicBrainKey } from "./brain-helpers"
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

const ERROR_TAXONOMY_LABELS: Record<string, string> = {
  falta_compreensao: "Confusão conceitual",
  falta_memorizacao: "Falta de memorização",
  conteudo_desconhecido: "Conteúdo desconhecido",
  interpretacao_errada: "Interpretação errada do enunciado",
  distrator_armadilha: "Caiu em distrator",
  pressa_desatencao: "Pressa ou desatenção",
}

async function hasExecutorDraftToday(params: {
  userId: string
  subjectId: string
  type: string
  topic: string
}): Promise<boolean> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const topicNorm = topicBrainKey(params.topic)
  const { data } = await supabaseServer
    .from("ai_action_drafts")
    .select("id, payload")
    .eq("user_id", params.userId)
    .eq("subject_id", params.subjectId)
    .eq("type", params.type)
    .eq("status", "pending")
    .eq("source_agent", "execution_plan")
    .gte("created_at", start.toISOString())

  return (data ?? []).some((d) => {
    const p = (d.payload ?? {}) as Record<string, unknown>
    const raw =
      (p.topic as string) ??
      (p.topic_key as string) ??
      (p.tec_topics as string[])?.[0] ??
      ""
    return topicNorm === topicBrainKey(String(raw))
  })
}

async function resolveTopicIdForSubject(
  userId: string,
  subjectId: string,
  topic: string
): Promise<string | null> {
  const { data: topics } = await supabaseServer
    .from("topics")
    .select("id, name")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)

  const match = (topics ?? []).find(
    (t) => t.name.trim().toLowerCase() === topic.trim().toLowerCase()
  )
  if (match) return match.id

  const { data: mapRow } = await supabaseServer
    .from("tec_taxonomy_mappings")
    .select("tec_subject, topic_id")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .not("topic_id", "is", null)
    .limit(1)
    .maybeSingle()

  if (!mapRow?.tec_subject) return null
  const resolved = await resolveQuestionMapping(
    userId,
    mapRow.tec_subject,
    topic
  )
  return resolved.topic_id
}

export async function enqueueExecutorErrorDrafts(params: {
  userId: string
  subjectIds: string[]
  queueBySubject: Map<string, QueueRow[]>
  limit: number
}): Promise<number> {
  const { userId, subjectIds, queueBySubject, limit } = params
  if (limit <= 0 || !subjectIds.length) return 0

  const topicsDone = new Set<string>()
  let created = 0

  for (const subjectId of subjectIds) {
    if (created >= limit) break

    const wrongRows = await pickClassifiedWrongAttempts(userId, subjectId, {
      limit: 30,
    })
    const queueTopics = (queueBySubject.get(subjectId) ?? [])
      .slice(0, 5)
      .map((q) => q.topic_label ?? q.topic_key)

    const wrongByTopic = new Map<string, WrongReviewRow>()
    for (const row of wrongRows) {
      const key = topicBrainKey(row.tec_topic)
      if (!wrongByTopic.has(key)) wrongByTopic.set(key, row)
    }

    const orderedTopics: { topic: string; row?: WrongReviewRow }[] = []
    for (const qt of queueTopics) {
      const key = topicBrainKey(qt)
      orderedTopics.push({ topic: qt, row: wrongByTopic.get(key) })
    }
    for (const row of wrongRows) {
      const key = topicBrainKey(row.tec_topic)
      if (!orderedTopics.some((t) => topicBrainKey(t.topic) === key)) {
        orderedTopics.push({ topic: row.tec_topic, row })
      }
    }

    for (const { topic, row } of orderedTopics) {
      if (created >= limit) break
      const dedupeKey = `${subjectId}:${topicBrainKey(topic)}`
      if (topicsDone.has(dedupeKey)) continue
      topicsDone.add(dedupeKey)

      if (
        await hasExecutorDraftToday({
          userId,
          subjectId,
          type: "error_create",
          topic,
        })
      ) {
        continue
      }

      const topicId = await resolveTopicIdForSubject(userId, subjectId, topic)
      if (!topicId) continue

      const tax = row?.error_taxonomy ?? "falta_compreensao"
      const taxLabel = ERROR_TAXONOMY_LABELS[tax] ?? "Lacuna identificada"
      const errorText = `${taxLabel} em ${topic}`
      const correctionText = `Revise ${topic}: confronte suas anotações com o gabarito e complete a correção ao aprovar.`

      await supabaseServer.from("ai_action_drafts").insert({
        user_id: userId,
        subject_id: subjectId,
        type: "error_create",
        label: `Erro no mapa: ${topic.slice(0, 60)}`,
        payload: {
          topic_id: topicId,
          error_text: errorText,
          correction_text: correctionText,
          description: `Sugerido pelo plano diário (${tax})`,
          topic,
        },
        source_agent: "execution_plan",
        status: "pending",
      })
      created++
    }
  }

  return created
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
  _userId: string,
  _pickedSubjects: string[],
  _queue: QueueRow[],
  _queueBySubject: Map<string, QueueRow[]>,
  _summariesBudget: number,
  _subjectNames: Map<string, string>
): Promise<DailyStudyBlock[]> {
  return []
}

export async function enqueueExecutorFlashcardDrafts(params: {
  userId: string
  subjectIds: string[]
  queueBySubject: Map<string, QueueRow[]>
  limit: number
}): Promise<number> {
  const { userId, subjectIds, queueBySubject, limit } = params
  if (limit <= 0 || !subjectIds.length) return 0

  const { subjects: decks } = await ensureSubjectDecks(userId)
  const deckBySubject = new Map(decks.map((d) => [d.subject_id, d.deck_id]))

  const topicsDone = new Set<string>()
  let created = 0

  for (const subjectId of subjectIds) {
    if (created >= limit) break
    const deckId = deckBySubject.get(subjectId)
    if (!deckId) continue

    const wrongRows = await pickClassifiedWrongAttempts(userId, subjectId, {
      limit: 30,
    })
    const memTopics = wrongRows
      .filter((r) => r.error_taxonomy === "falta_memorizacao")
      .map((r) => r.tec_topic)

    const queueTopics = (queueBySubject.get(subjectId) ?? [])
      .slice(0, 3)
      .map((q) => q.topic_label ?? q.topic_key)

    for (const topic of [...memTopics, ...queueTopics]) {
      if (created >= limit) break
      const key = `${subjectId}:${topicBrainKey(topic)}`
      if (topicsDone.has(key)) continue
      topicsDone.add(key)

      if (
        await hasExecutorDraftToday({
          userId,
          subjectId,
          type: "flashcard_create",
          topic,
        })
      ) {
        continue
      }

      await supabaseServer.from("ai_action_drafts").insert({
        user_id: userId,
        subject_id: subjectId,
        type: "flashcard_create",
        label: `Flashcard (memorização): ${topic.slice(0, 60)}`,
        payload: {
          deck_id: deckId,
          type: "basic",
          front_text: `Conceito: ${topic}`,
          back_text: "Revise com seu material e complete o verso ao aprovar.",
          source: "executor_plan",
          topic,
        },
        source_agent: "execution_plan",
        status: "pending",
      })
      created++
    }
  }

  return created
}

export async function buildComprehensionSummaryBlocks(params: {
  userId: string
  subjectIds: string[]
  queueBySubject: Map<string, QueueRow[]>
  summariesBudget: number
  subjectNames: Map<string, string>
}): Promise<{ blocks: DailyStudyBlock[]; inboxDrafts: number }> {
  const { userId, subjectIds, queueBySubject, summariesBudget, subjectNames } =
    params
  const blocks: DailyStudyBlock[] = []
  let budget = summariesBudget
  let inboxDrafts = 0

  for (const subjectId of subjectIds) {
    if (budget <= 0) break

    const wrongRows = await pickClassifiedWrongAttempts(userId, subjectId, {
      limit: 20,
    })
    const comprehensionTopics = new Set(
      wrongRows
        .filter((r) => r.error_taxonomy === "falta_compreensao")
        .map((r) => r.tec_topic)
    )

    const candidates = (queueBySubject.get(subjectId) ?? []).slice(0, 5)
    const ordered = [
      ...candidates.filter((c) =>
        comprehensionTopics.has(c.topic_label ?? c.topic_key)
      ),
      ...candidates,
    ]

    let done = false
    for (const top of ordered) {
      if (budget <= 0 || done) break
      const topicKey = top.topic_key
      const searchQuery = top.topic_label ?? topicKey
      if (!searchQuery) continue

      await supabaseServer.from("ai_action_drafts").insert({
        user_id: userId,
        subject_id: subjectId,
        type: "summary_suggest",
        label: `Resumo sugerido: ${searchQuery.slice(0, 50)}`,
        payload: {
          topic: searchQuery,
          topic_key: topicKey,
          reason: top.reason,
          hint: "Revise o tópico com suas anotações ou questões erradas.",
        },
        source_agent: "execution_plan",
        status: "pending",
      })
      inboxDrafts++
      budget--
      done = true
    }
  }

  return { blocks, inboxDrafts }
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
  generation_meta?: unknown
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
  generation_meta?: PlanGenerationMeta
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
    generation_meta: (row.generation_meta as PlanGenerationMeta) ?? undefined,
  }
}
