import { supabaseServer } from "./supabase-server"
import type {
  ConfidenceLevel,
  OutcomeCategory,
  StudyQueueItem,
} from "./question-types"

export function computeOutcomeCategory(
  confidence: ConfidenceLevel,
  is_correct: boolean
): OutcomeCategory {
  if (confidence === "chute") {
    return is_correct ? "falso_positivo" : "conteudo_desconhecido"
  }
  if (confidence === "inseguro") {
    return is_correct ? "conhecimento_fragil" : "lacuna_consciente"
  }
  return is_correct ? "conhecimento_solido" : "lacuna_critica"
}

export function parseConfidenceLevel(raw: unknown): ConfidenceLevel {
  if (raw === "inseguro" || raw === "chute") return raw
  return "seguro"
}

function mapNotebookRows(
  rows: {
    position: number
    question_id: string
    questions: { tec_id: number } | { tec_id: number }[] | null
  }[],
  notebookId: string
): StudyQueueItem[] {
  return (rows ?? []).map((r) => {
    const q = r.questions as { tec_id: number } | { tec_id: number }[] | null
    const tecId = Array.isArray(q) ? q[0]?.tec_id : q?.tec_id
    return {
      question_id: r.question_id,
      tec_id: tecId ?? 0,
      notebook_id: notebookId,
      position: r.position,
    }
  })
}

export async function buildNotebookFullQueue(
  notebookId: string
): Promise<StudyQueueItem[]> {
  const { data: rows, error } = await supabaseServer
    .from("notebook_questions")
    .select(
      `
      position,
      question_id,
      questions ( tec_id )
    `
    )
    .eq("notebook_id", notebookId)
    .order("position", { ascending: true })

  if (error) throw new Error(error.message)
  return mapNotebookRows(rows ?? [], notebookId)
}

export async function buildNotebookQueue(
  notebookId: string,
  userId: string
): Promise<StudyQueueItem[]> {
  const full = await buildNotebookFullQueue(notebookId)
  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select("question_id")
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)

  const answered = new Set((attempts ?? []).map((a) => a.question_id))
  return full.filter((item) => !answered.has(item.question_id))
}

export async function getNotebookAttemptStats(notebookId: string, userId: string) {
  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select("question_id, is_correct")
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)

  const byQuestion = new Map<string, boolean>()
  for (const a of attempts ?? []) {
    byQuestion.set(a.question_id, a.is_correct)
  }
  let correct = 0
  let wrong = 0
  for (const ok of byQuestion.values()) {
    if (ok) correct++
    else wrong++
  }
  return {
    resolved: byQuestion.size,
    correct,
    wrong,
  }
}

export async function buildCombinedQueue(
  notebookIds: string[],
  userId: string,
  shuffle: boolean
): Promise<StudyQueueItem[]> {
  const all: StudyQueueItem[] = []
  for (const nbId of notebookIds) {
    const { data: rows } = await supabaseServer
      .from("notebook_questions")
      .select(
        `
        position,
        question_id,
        questions ( tec_id )
      `
      )
      .eq("notebook_id", nbId)
      .order("position", { ascending: true })

    for (const r of rows ?? []) {
      const q = r.questions as { tec_id: number } | { tec_id: number }[] | null
      const tecId = Array.isArray(q) ? q[0]?.tec_id : q?.tec_id
      all.push({
        question_id: r.question_id,
        tec_id: tecId ?? 0,
        notebook_id: nbId,
        position: r.position,
      })
    }
  }

  const seenTec = new Set<number>()
  const deduped: StudyQueueItem[] = []
  for (const item of all) {
    if (seenTec.has(item.tec_id)) continue
    seenTec.add(item.tec_id)
    deduped.push(item)
  }

  if (shuffle) {
    for (let i = deduped.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deduped[i], deduped[j]] = [deduped[j], deduped[i]]
    }
  }

  return deduped
}

export function normalizeAnswer(
  type: string,
  selected: string,
  correct: string
): boolean {
  const s = selected.trim()
  const c = correct.trim()
  if (/^anulada$/i.test(c)) return false
  if (type === "certo_errado") {
    return s.toLowerCase() === c.toLowerCase()
  }
  return s.toUpperCase() === c.toUpperCase()
}

export async function recordAttempt(params: {
  user_id: string
  question_id: string
  notebook_id: string | null
  study_session_id: string | null
  selected_answer: string
  is_correct: boolean
  duration_ms: number | null
  confidence_level?: ConfidenceLevel
}) {
  const confidence = params.confidence_level ?? "seguro"
  const outcome_category = computeOutcomeCategory(confidence, params.is_correct)
  const { error } = await supabaseServer.from("question_attempts").insert({
    user_id: params.user_id,
    question_id: params.question_id,
    notebook_id: params.notebook_id,
    study_session_id: params.study_session_id,
    selected_answer: params.selected_answer,
    is_correct: params.is_correct,
    duration_ms: params.duration_ms,
    confidence_level: confidence,
    outcome_category,
  })
  if (error) throw new Error(error.message)
}

export async function loadQuestionForStudy(questionId: string) {
  const { data: question, error } = await supabaseServer
    .from("questions")
    .select("*")
    .eq("id", questionId)
    .single()
  if (error || !question) return { question: null, options: [] as { label: string; text: string; sort_order: number }[] }

  const { data: options } = await supabaseServer
    .from("question_options")
    .select("*")
    .eq("question_id", questionId)
    .order("sort_order")

  return { question, options: options ?? [] }
}

export async function refreshNotebookProgress(notebookId: string, userId: string) {
  const { count: total } = await supabaseServer
    .from("notebook_questions")
    .select("id", { count: "exact", head: true })
    .eq("notebook_id", notebookId)

  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select("question_id, is_correct")
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)

  const uniqueAnswered = new Set((attempts ?? []).map((a) => a.question_id))
  const answered_count = uniqueAnswered.size
  const totalCount = total ?? 0

  const update: Record<string, unknown> = {
    answered_count,
    last_accessed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (totalCount > 0 && answered_count >= totalCount) {
    update.completed_at = new Date().toISOString()
  }

  await supabaseServer.from("notebooks").update(update).eq("id", notebookId)
}
