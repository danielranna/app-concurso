import { supabaseServer } from "./supabase-server"
import { loadMappings } from "./tec-mapping"

type QMeta = {
  id?: string
  tec_id: number
  tec_subject: string
  tec_topic: string
}

function unwrapQ(q: QMeta | QMeta[] | null | undefined): QMeta | null {
  if (!q) return null
  return Array.isArray(q) ? q[0] ?? null : q
}

export type PerformanceNotebookRules = {
  wrong_only?: boolean
  min_wrong_attempts?: number
  tec_topics?: string[]
  tec_subjects?: string[]
  outcome_categories?: string[]
  source_notebook_id?: string
  subject_id?: string
  limit?: number
}

export async function pickQuestionIdsFromPerformance(
  userId: string,
  rules: PerformanceNotebookRules
): Promise<string[]> {
  const limit = Math.min(rules.limit ?? 50, 200)
  let attemptQuery = supabaseServer
    .from("question_attempts")
    .select(
      `
      question_id, is_correct, outcome_category, created_at,
      questions ( id, tec_id, tec_subject, tec_topic )
    `
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (rules.source_notebook_id) {
    attemptQuery = attemptQuery.eq("notebook_id", rules.source_notebook_id)
  }

  const { data: attempts, error } = await attemptQuery
  if (error) throw new Error(error.message)

  let filtered = attempts ?? []

  if (rules.subject_id) {
    const mappings = await loadMappings(userId)
    const tecSubjects = new Set(
      mappings
        .filter((m) => m.subject_id === rules.subject_id)
        .map((m) => (m.tec_subject ?? "").trim())
        .filter(Boolean)
    )
    filtered = filtered.filter((a) => {
      const q = unwrapQ(a.questions as QMeta | QMeta[] | null)
      return q && tecSubjects.has((q.tec_subject ?? "").trim())
    })
  }

  if (rules.tec_topics?.length) {
    const topics = new Set(rules.tec_topics.map((t) => t.trim()))
    filtered = filtered.filter((a) => {
      const q = unwrapQ(a.questions as QMeta | QMeta[] | null)
      return topics.has((q?.tec_topic ?? "").trim())
    })
  }

  if (rules.tec_subjects?.length) {
    const subs = new Set(rules.tec_subjects.map((s) => s.trim()))
    filtered = filtered.filter((a) => {
      const q = unwrapQ(a.questions as QMeta | QMeta[] | null)
      return subs.has((q?.tec_subject ?? "").trim())
    })
  }

  if (rules.outcome_categories?.length) {
    const oc = new Set(rules.outcome_categories)
    filtered = filtered.filter((a) => oc.has(a.outcome_category ?? ""))
  }

  const wrongByQuestion = new Map<string, number>()
  const lastCorrectSolid = new Map<string, boolean>()

  for (const a of filtered) {
    if (!a.is_correct) {
      wrongByQuestion.set(a.question_id, (wrongByQuestion.get(a.question_id) ?? 0) + 1)
    }
    if (!lastCorrectSolid.has(a.question_id)) {
      lastCorrectSolid.set(
        a.question_id,
        a.is_correct && a.outcome_category === "conhecimento_solido"
      )
    }
  }

  const minWrong = rules.min_wrong_attempts ?? 1
  const ids: string[] = []
  const seenTec = new Set<number>()

  for (const a of filtered) {
    if (ids.length >= limit) break
    const qid = a.question_id
    if (ids.includes(qid)) continue

    const wrongCount = wrongByQuestion.get(qid) ?? 0
    const excludeSolid = lastCorrectSolid.get(qid)

    if (rules.wrong_only !== false && wrongCount < minWrong) continue
    if (excludeSolid && wrongCount === 0) continue

    const q = unwrapQ(a.questions as QMeta | QMeta[] | null)
    if (q?.tec_id && seenTec.has(q.tec_id)) continue
    if (q?.tec_id) seenTec.add(q.tec_id)

    ids.push(qid)
  }

  return ids
}

export async function createNotebookFromQuestionIds(
  userId: string,
  name: string,
  subjectId: string,
  questionIds: string[],
  folderId?: string | null
) {
  const { data: notebook, error: nbErr } = await supabaseServer
    .from("notebooks")
    .insert({
      user_id: userId,
      name,
      subject_id: subjectId,
      folder_id: folderId ?? null,
      question_count: questionIds.length,
    })
    .select("id")
    .single()

  if (nbErr) throw new Error(nbErr.message)

  for (let i = 0; i < questionIds.length; i++) {
    await supabaseServer.from("notebook_questions").insert({
      notebook_id: notebook.id,
      question_id: questionIds[i],
      position: i,
    })
  }

  return notebook.id
}
