import { supabaseServer } from "./supabase-server"
import { fetchAllPages, mapPool } from "./supabase-pages"

export type QuestionTaxonomyRow = {
  tec_subject: string | null
  tec_topic: string | null
  statement: string | null
}

const NOTEBOOK_ID_BATCH = 80
const TAXONOMY_BATCH_CONCURRENCY = 3
const CACHE_MS = 45_000

type NotebookQuestionJoinRow = {
  question_id: string
  questions:
    | { tec_subject: string | null; tec_topic: string | null }
    | { tec_subject: string | null; tec_topic: string | null }[]
    | null
}

const taxonomyCache = new Map<
  string,
  { expires: number; promise: Promise<QuestionTaxonomyRow[]> }
>()

export function invalidateQuestionTaxonomyCache(userId?: string) {
  if (userId) taxonomyCache.delete(userId)
  else taxonomyCache.clear()
}

function unwrapQuestion(
  row: NotebookQuestionJoinRow
): { tec_subject: string | null; tec_topic: string | null } | null {
  const q = row.questions
  if (!q) return null
  return Array.isArray(q) ? q[0] ?? null : q
}

async function fetchQuestionTaxonomyForUserUncached(
  userId: string
): Promise<QuestionTaxonomyRow[]> {
  const notebooks = await fetchAllPages<{ id: string }>((from, to) =>
    supabaseServer
      .from("notebooks")
      .select("id")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, to)
  )

  const notebookIds = notebooks.map((n) => n.id)
  if (!notebookIds.length) return []

  const batches: string[][] = []
  for (let i = 0; i < notebookIds.length; i += NOTEBOOK_ID_BATCH) {
    batches.push(notebookIds.slice(i, i + NOTEBOOK_ID_BATCH))
  }

  const seen = new Set<string>()
  const rows: QuestionTaxonomyRow[] = []

  await mapPool(batches, TAXONOMY_BATCH_CONCURRENCY, async (batch) => {
    const pageRows = await fetchAllPages<NotebookQuestionJoinRow>((from, to) =>
      supabaseServer
        .from("notebook_questions")
        .select("question_id, questions ( tec_subject, tec_topic )")
        .in("notebook_id", batch)
        .order("question_id", { ascending: true })
        .range(from, to)
    )
    for (const row of pageRows) {
      const qid = row.question_id
      if (!qid || seen.has(qid)) continue
      const q = unwrapQuestion(row)
      if (!q) continue
      seen.add(qid)
      rows.push({
        tec_subject: q.tec_subject,
        tec_topic: q.tec_topic,
        statement: null,
      })
    }
  })

  return rows
}

/**
 * Taxonomia TEC das questões nos cadernos do usuário (join + dedupe).
 * Enunciado não vem nesta leitura — use fetchSampleStatementsByTecSubject.
 */
export function fetchQuestionTaxonomyForUser(
  userId: string
): Promise<QuestionTaxonomyRow[]> {
  const now = Date.now()
  const hit = taxonomyCache.get(userId)
  if (hit && hit.expires > now) return hit.promise

  const promise = fetchQuestionTaxonomyForUserUncached(userId)
  taxonomyCache.set(userId, { expires: now + CACHE_MS, promise })

  promise.catch(() => {
    taxonomyCache.delete(userId)
  })

  return promise
}

/** One statement excerpt per TEC subject (mapping UI only). */
export async function fetchSampleStatementsByTecSubject(
  tecSubjects: string[]
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(tecSubjects.map((s) => s.trim()).filter(Boolean)),
  ]
  const map = new Map<string, string>()
  await mapPool(unique, TAXONOMY_BATCH_CONCURRENCY, async (sub) => {
    const { data, error } = await supabaseServer
      .from("questions")
      .select("statement")
      .eq("tec_subject", sub)
      .not("statement", "is", null)
      .limit(1)
    if (error) throw new Error(error.message)
    const stmt = String(data?.[0]?.statement ?? "").trim()
    if (stmt) map.set(sub, stmt.slice(0, 280))
  })
  return map
}
