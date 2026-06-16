import { supabaseServer } from "./supabase-server"

export type QuestionTaxonomyRow = {
  tec_subject: string | null
  tec_topic: string | null
  statement: string | null
}

const PAGE_SIZE = 1000
const NOTEBOOK_ID_BATCH = 80
const CACHE_MS = 45_000

type NotebookQuestionJoinRow = {
  question_id: string
  questions:
    | QuestionTaxonomyRow
    | QuestionTaxonomyRow[]
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

function unwrapQuestion(row: NotebookQuestionJoinRow): QuestionTaxonomyRow | null {
  const q = row.questions
  if (!q) return null
  return Array.isArray(q) ? q[0] ?? null : q
}

async function fetchQuestionTaxonomyForUserUncached(
  userId: string
): Promise<QuestionTaxonomyRow[]> {
  const { data: notebooks, error: nbErr } = await supabaseServer
    .from("notebooks")
    .select("id")
    .eq("user_id", userId)

  if (nbErr) throw new Error(nbErr.message)

  const notebookIds = (notebooks ?? []).map((n) => n.id as string)
  if (!notebookIds.length) return []

  const seen = new Set<string>()
  const rows: QuestionTaxonomyRow[] = []

  for (let i = 0; i < notebookIds.length; i += NOTEBOOK_ID_BATCH) {
    const batch = notebookIds.slice(i, i + NOTEBOOK_ID_BATCH)
    let offset = 0

    while (true) {
      const { data, error } = await supabaseServer
        .from("notebook_questions")
        .select("question_id, questions ( tec_subject, tec_topic, statement )")
        .in("notebook_id", batch)
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) throw new Error(error.message)

      const batchRows = (data ?? []) as NotebookQuestionJoinRow[]
      if (!batchRows.length) break

      for (const row of batchRows) {
        const qid = row.question_id
        if (!qid || seen.has(qid)) continue
        const q = unwrapQuestion(row)
        if (!q) continue
        seen.add(qid)
        rows.push(q)
      }

      if (batchRows.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }
  }

  return rows
}

/**
 * Taxonomia TEC das questões nos cadernos do usuário (join + dedupe).
 * Resultado em cache curto por usuário para evitar rajadas de queries.
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
