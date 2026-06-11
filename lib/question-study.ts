import { supabaseServer } from "./supabase-server"
import { loadSharedBlocksForQuestion } from "./shared-assets-server"
import type { ResolvedSharedBlock } from "./shared-assets-types"
import type {
  ConfidenceLevel,
  OutcomeCategory,
  StudyQueueItem,
  StudySessionNotebookBreakdown,
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

export type StudyOption = { label: string; text: string; sort_order?: number }

export function normalizeStudyOptions(
  questionType: string,
  raw: { label: string; text: string; sort_order?: number }[]
): StudyOption[] {
  let opts = raw.map((o, i) => ({
    label: o.label,
    text: o.text,
    sort_order: o.sort_order ?? i,
  }))
  if (questionType === "certo_errado" && opts.length === 0) {
    opts = [
      { label: "Certo", text: "Certo", sort_order: 0 },
      { label: "Errado", text: "Errado", sort_order: 1 },
    ]
  }
  return opts
}

/** Questões já respondidas nesta sessão de estudo (por question_id, não tec_id). */
export async function getSessionAnsweredQuestionIds(
  studySessionId: string,
  userId: string
): Promise<Set<string>> {
  const { data, error } = await supabaseServer
    .from("question_attempts")
    .select("question_id")
    .eq("study_session_id", studySessionId)
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r) => r.question_id))
}

type SessionAttemptRow = {
  question_id: string
  is_correct: boolean
  duration_ms: number | null
  created_at: string
}

/** Última tentativa por questão nesta sessão. */
export async function getSessionAttemptsByQuestion(
  studySessionId: string,
  userId: string
): Promise<Map<string, { is_correct: boolean; duration_ms: number }>> {
  const { data, error } = await supabaseServer
    .from("question_attempts")
    .select("question_id, is_correct, duration_ms, created_at")
    .eq("study_session_id", studySessionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  const byQuestion = new Map<string, { is_correct: boolean; duration_ms: number }>()
  for (const row of (data ?? []) as SessionAttemptRow[]) {
    if (byQuestion.has(row.question_id)) continue
    byQuestion.set(row.question_id, {
      is_correct: row.is_correct,
      duration_ms: row.duration_ms ?? 0,
    })
  }
  return byQuestion
}

export async function getSessionAttemptStats(studySessionId: string, userId: string) {
  const byQuestion = await getSessionAttemptsByQuestion(studySessionId, userId)
  let correct = 0
  let wrong = 0
  for (const attempt of byQuestion.values()) {
    if (attempt.is_correct) correct++
    else wrong++
  }
  return {
    resolved: byQuestion.size,
    correct,
    wrong,
  }
}

/** Estatísticas por caderno vinculado ao estudo combinado (lista completa de cada caderno). */
export async function getStudySessionNotebookBreakdown(
  studySessionId: string,
  userId: string
): Promise<StudySessionNotebookBreakdown[]> {
  const { data: links, error: linksError } = await supabaseServer
    .from("study_session_notebooks")
    .select("notebook_id, notebooks(id, name, question_count)")
    .eq("study_session_id", studySessionId)

  if (linksError) throw new Error(linksError.message)
  if (!links?.length) return []

  const attemptsByQuestion = await getSessionAttemptsByQuestion(studySessionId, userId)
  const breakdown: StudySessionNotebookBreakdown[] = []

  for (const link of links) {
    const nb = link.notebooks as
      | { id: string; name: string; question_count: number }
      | { id: string; name: string; question_count: number }[]
      | null
    const notebook = Array.isArray(nb) ? nb[0] : nb
    const notebookId = link.notebook_id as string

    const { data: rows, error: rowsError } = await supabaseServer
      .from("notebook_questions")
      .select("question_id")
      .eq("notebook_id", notebookId)

    if (rowsError) throw new Error(rowsError.message)

    const questionIds = (rows ?? []).map((r) => r.question_id as string)
    const total =
      questionIds.length > 0 ? questionIds.length : (notebook?.question_count ?? 0)

    let correct = 0
    let wrong = 0
    let time_ms = 0

    for (const qid of questionIds) {
      const attempt = attemptsByQuestion.get(qid)
      if (!attempt) continue
      if (attempt.is_correct) correct++
      else wrong++
      time_ms += attempt.duration_ms
    }

    const pct = total > 0 ? Math.round((correct / total) * 100) : 0

    breakdown.push({
      notebook_id: notebookId,
      name: notebook?.name ?? "Caderno",
      total,
      correct,
      wrong,
      pct,
      time_ms,
    })
  }

  return breakdown
}

export async function loadQuestionForStudy(questionId: string, userId?: string) {
  const { data: question, error } = await supabaseServer
    .from("questions")
    .select("*")
    .eq("id", questionId)
    .single()
  if (error || !question) {
    return { question: null, options: [] as StudyOption[], shared_blocks: [] as ResolvedSharedBlock[] }
  }

  const { data: options } = await supabaseServer
    .from("question_options")
    .select("*")
    .eq("question_id", questionId)
    .order("sort_order")

  let merged = { ...question }
  let optsList = (options ?? []) as StudyOption[]

  if (userId) {
    const { data: edit } = await supabaseServer
      .from("user_question_edits")
      .select("*")
      .eq("user_id", userId)
      .eq("question_id", questionId)
      .maybeSingle()

    if (edit) {
      if (edit.type) merged.type = edit.type
      if (edit.statement != null) merged.statement = edit.statement
      if (edit.content_blocks != null) merged.content_blocks = edit.content_blocks
      if (edit.content_before != null) merged.content_before = edit.content_before
      if (edit.content_after != null) merged.content_after = edit.content_after
      if (edit.correct_answer != null) merged.correct_answer = edit.correct_answer
      if (edit.options && Array.isArray(edit.options)) {
        optsList = (edit.options as { label: string; text: string; sort_order?: number }[]).map(
          (o, i) => ({
            label: o.label,
            text: o.text,
            sort_order: o.sort_order ?? i,
          })
        )
      }
    }
  }

  let shared_blocks: ResolvedSharedBlock[] = []
  if (userId) {
    try {
      shared_blocks = await loadSharedBlocksForQuestion(questionId, userId)
    } catch {
      shared_blocks = []
    }
  }

  return {
    question: { ...merged, shared_blocks },
    options: normalizeStudyOptions(merged.type, optsList),
    shared_blocks,
  }
}

export async function pickWrongIdsFromNotebook(
  notebookId: string,
  userId: string
): Promise<string[]> {
  const { data: attempts, error } = await supabaseServer
    .from("question_attempts")
    .select("question_id, is_correct, created_at")
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)
    .order("created_at", { ascending: false })

  if (error) throw new Error(error.message)

  const lastByQuestion = new Map<string, boolean>()
  for (const a of attempts ?? []) {
    if (!lastByQuestion.has(a.question_id)) {
      lastByQuestion.set(a.question_id, a.is_correct)
    }
  }

  return [...lastByQuestion.entries()]
    .filter(([, correct]) => !correct)
    .map(([id]) => id)
}

export async function refreshNotebookProgress(
  notebookId: string,
  userId: string
): Promise<{ justCompleted: boolean }> {
  const { data: before } = await supabaseServer
    .from("notebooks")
    .select("completed_at")
    .eq("id", notebookId)
    .single()

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
  const willComplete =
    totalCount > 0 && answered_count >= totalCount && !before?.completed_at
  if (totalCount > 0 && answered_count >= totalCount) {
    update.completed_at = before?.completed_at ?? new Date().toISOString()
    if (willComplete) update.report_pending = true
  } else if (totalCount > 0 && answered_count < totalCount) {
    update.completed_at = null
    update.report_pending = false
  }

  await supabaseServer.from("notebooks").update(update).eq("id", notebookId)
  return { justCompleted: willComplete }
}

export async function resetNotebookProgress(
  notebookId: string,
  userId: string,
  mode: "all" | "wrong",
  opts?: { resetTimer?: boolean }
): Promise<{ deletedCount: number; wrongRemaining: number }> {
  const { data: nb, error: nbErr } = await supabaseServer
    .from("notebooks")
    .select("user_id")
    .eq("id", notebookId)
    .single()

  if (nbErr || !nb) throw new Error("Caderno não encontrado")
  if (nb.user_id !== userId) throw new Error("Não autorizado")

  let questionIds: string[] | null = null
  if (mode === "wrong") {
    questionIds = await pickWrongIdsFromNotebook(notebookId, userId)
    if (!questionIds.length) {
      return { deletedCount: 0, wrongRemaining: 0 }
    }
  }

  let deleteQuery = supabaseServer
    .from("question_attempts")
    .delete()
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)

  if (questionIds) {
    deleteQuery = deleteQuery.in("question_id", questionIds)
  }

  const { error: delErr } = await deleteQuery
  if (delErr) throw new Error(delErr.message)
  const deletedCount = questionIds?.length ?? 0

  const resetTimer = mode === "all" && (opts?.resetTimer ?? true)
  const notebookUpdate: Record<string, unknown> = {
    active_question_id: null,
    updated_at: new Date().toISOString(),
  }
  if (resetTimer) {
    notebookUpdate.study_elapsed_ms = 0
  }
  if (mode === "all") {
    notebookUpdate.answered_count = 0
    notebookUpdate.completed_at = null
    notebookUpdate.report_pending = false
  }

  await supabaseServer.from("notebooks").update(notebookUpdate).eq("id", notebookId)

  if (mode === "wrong") {
    await refreshNotebookProgress(notebookId, userId)
  }

  if (mode === "all") {
    const { count: total } = await supabaseServer
      .from("notebook_questions")
      .select("id", { count: "exact", head: true })
      .eq("notebook_id", notebookId)
    const stats = await getNotebookAttemptStats(notebookId, userId)
    return {
      deletedCount: total ?? 0,
      wrongRemaining: stats.wrong,
    }
  }

  const stats = await getNotebookAttemptStats(notebookId, userId)
  return {
    deletedCount,
    wrongRemaining: stats.wrong,
  }
}
