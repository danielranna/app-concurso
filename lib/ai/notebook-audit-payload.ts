import { supabaseServer } from "../supabase-server"
import type { AuditZone } from "../coach-types"
import { combineNoteBodies } from "../note-entry-utils"
import {
  loadNoteEntriesByQuestion,
  type QuestionNoteEntryRow,
} from "../question-notes"

export type NotebookAuditQuestion = {
  question_index: number
  question_id: string
  attempt_id: string | null
  tec_id: number
  tec_topic: string
  banca: string | null
  ano: number | null
  orgao: string | null
  header_label: string
  statement: string
  statement_excerpt: string
  selected_answer: string
  correct_answer: string
  is_correct: boolean
  outcome_category: string
  confidence_level: string
  duration_ms: number | null
  user_note: string
  note_entries: QuestionNoteEntryRow[]
  zone: AuditZone
  attempt_feedback?: string | null
  attempt_misconception?: string | null
}

export type NotebookAuditPayload = {
  notebook_id: string
  notebook_name: string
  subject_name: string
  questions: NotebookAuditQuestion[]
  performance_summary: {
    correct: number
    total: number
    pct: number
    avg_duration_ms: number
    groups: { red: number; yellow: number; green: number }
  }
}

function unwrap<T>(v: T | T[] | null): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

export function buildQuestionHeaderLabel(q: {
  banca: string | null
  ano: number | null
  orgao: string | null
  tec_topic: string
  question_index: number
}): string {
  const parts = [
    q.banca,
    q.ano != null ? String(q.ano) : null,
    q.orgao,
    `Q${q.question_index}`,
  ].filter(Boolean)
  if (parts.length <= 1) {
    const topic = q.tec_topic?.trim()
    return topic ? `${topic} — Q${q.question_index}` : `Q${q.question_index}`
  }
  return parts.join(" — ")
}

function feedbackFromErrorDetail(detail: unknown): {
  attempt_feedback: string | null
  attempt_misconception: string | null
} {
  const rec = detail && typeof detail === "object" ? (detail as Record<string, unknown>) : null
  const feedback =
    typeof rec?.feedback_detailed === "string" ? rec.feedback_detailed.trim() : ""
  const misconception =
    typeof rec?.misconception === "string"
      ? rec.misconception.trim()
      : typeof rec?.specific_mistake === "string"
        ? rec.specific_mistake.trim()
        : ""
  return {
    attempt_feedback: feedback || null,
    attempt_misconception: misconception || null,
  }
}

function noteSuggestsUncertainty(note: string): boolean {
  const n = note.toLowerCase()
  return (
    n.includes("?") ||
    n.includes("explique") ||
    n.includes("não entendi") ||
    n.includes("nao entendi") ||
    n.includes("dúvida") ||
    n.includes("duvida")
  )
}

export function classifyAuditZone(q: {
  is_correct: boolean
  outcome_category: string
  confidence_level: string
  user_note: string
}): AuditZone {
  const oc = q.outcome_category
  const conf = q.confidence_level

  if (!q.is_correct) return "red"
  if (oc === "falso_positivo") return "red"

  if (
    oc === "conhecimento_fragil" ||
    oc === "lacuna_consciente" ||
    conf === "inseguro" ||
    conf === "chute" ||
    noteSuggestsUncertainty(q.user_note)
  ) {
    return "yellow"
  }

  if (oc === "conhecimento_solido" && conf === "seguro") return "green"

  if (q.is_correct) return "yellow"
  return "red"
}

export async function buildNotebookAuditPayload(
  notebookId: string,
  userId: string
): Promise<NotebookAuditPayload> {
  const { data: nb, error: nbErr } = await supabaseServer
    .from("notebooks")
    .select("id, name, subject_id")
    .eq("id", notebookId)
    .eq("user_id", userId)
    .single()

  if (nbErr || !nb) throw new Error("Caderno não encontrado")

  let subjectName = ""
  if (nb.subject_id) {
    const { data: sub } = await supabaseServer
      .from("subjects")
      .select("name")
      .eq("id", nb.subject_id)
      .single()
    subjectName = sub?.name ?? ""
  }

  const { data: nqRows } = await supabaseServer
    .from("notebook_questions")
    .select(
      `
      position, question_id,
      questions (
        id, tec_id, tec_topic, statement, correct_answer, banca, ano, orgao
      )
    `
    )
    .eq("notebook_id", notebookId)
    .order("position", { ascending: true })

  const questionIds = (nqRows ?? []).map((r) => r.question_id)

  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select(
      "id, question_id, selected_answer, is_correct, outcome_category, confidence_level, duration_ms, created_at, error_detail"
    )
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)
    .order("created_at", { ascending: true })

  const latestAttemptByQ = new Map<string, NonNullable<typeof attempts>[number]>()
  for (const a of attempts ?? []) {
    latestAttemptByQ.set(a.question_id, a)
  }

  const entriesByQuestion = await loadNoteEntriesByQuestion(userId, questionIds)

  const questions: NotebookAuditQuestion[] = []
  let index = 0

  for (const row of nqRows ?? []) {
    index++
    const qu = unwrap(row.questions)
    if (!qu) continue

    const att = latestAttemptByQ.get(row.question_id)
    const noteEntries = entriesByQuestion.get(row.question_id) ?? []
    const userNote = combineNoteBodies(noteEntries)
    const topic = qu.tec_topic?.trim() || "Sem tópico"
    const isCorrect = att?.is_correct ?? false
    const outcome = att?.outcome_category ?? "conhecimento_solido"
    const confidence = att?.confidence_level ?? "seguro"

    const zone = classifyAuditZone({
      is_correct: isCorrect,
      outcome_category: outcome,
      confidence_level: confidence,
      user_note: userNote,
    })

    const statement = qu.statement ?? ""

    questions.push({
      question_index: index,
      question_id: row.question_id,
      attempt_id: att?.id ?? null,
      tec_id: qu.tec_id,
      tec_topic: topic,
      banca: qu.banca,
      ano: qu.ano,
      orgao: qu.orgao,
      header_label: buildQuestionHeaderLabel({
        banca: qu.banca,
        ano: qu.ano,
        orgao: qu.orgao,
        tec_topic: topic,
        question_index: index,
      }),
      statement,
      statement_excerpt: statement.slice(0, 800),
      selected_answer: att?.selected_answer ?? "—",
      correct_answer: qu.correct_answer ?? "—",
      is_correct: isCorrect,
      outcome_category: outcome,
      confidence_level: confidence,
      duration_ms: att?.duration_ms ?? null,
      user_note: userNote,
      note_entries: noteEntries,
      zone,
      ...feedbackFromErrorDetail(att?.error_detail),
    })
  }

  const correct = questions.filter((q) => q.is_correct).length
  const total = questions.length
  const durations = questions
    .map((q) => q.duration_ms)
    .filter((d): d is number => d != null && d > 0)
  const avg_duration_ms = durations.length
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
    : 0

  const groups = {
    red: questions.filter((q) => q.zone === "red").length,
    yellow: questions.filter((q) => q.zone === "yellow").length,
    green: questions.filter((q) => q.zone === "green").length,
  }

  return {
    notebook_id: notebookId,
    notebook_name: nb.name,
    subject_name: subjectName,
    questions,
    performance_summary: {
      correct,
      total,
      pct: total ? Math.round((correct / total) * 100) : 0,
      avg_duration_ms,
      groups,
    },
  }
}

export async function buildAttemptAuditPayload(
  userId: string,
  attemptId: string
): Promise<NotebookAuditPayload> {
  const { data: attempt, error: attErr } = await supabaseServer
    .from("question_attempts")
    .select(
      "id, question_id, notebook_id, selected_answer, is_correct, outcome_category, confidence_level, duration_ms, error_detail"
    )
    .eq("id", attemptId)
    .eq("user_id", userId)
    .maybeSingle()

  if (attErr) throw new Error(attErr.message)
  if (!attempt) throw new Error("Tentativa não encontrada")

  const { data: qu, error: qErr } = await supabaseServer
    .from("questions")
    .select("id, tec_id, tec_topic, statement, correct_answer, banca, ano, orgao")
    .eq("id", attempt.question_id)
    .maybeSingle()

  if (qErr) throw new Error(qErr.message)
  if (!qu) throw new Error("Questão não encontrada")

  let notebookName = "Questão"
  let subjectName = ""
  const notebookId = (attempt.notebook_id as string | null) ?? attempt.question_id

  if (attempt.notebook_id) {
    const { data: nb } = await supabaseServer
      .from("notebooks")
      .select("id, name, subject_id")
      .eq("id", attempt.notebook_id)
      .maybeSingle()
    if (nb?.name) notebookName = nb.name
    if (nb?.subject_id) {
      const { data: sub } = await supabaseServer
        .from("subjects")
        .select("name")
        .eq("id", nb.subject_id)
        .maybeSingle()
      subjectName = sub?.name ?? ""
    }
  }

  const entriesByQuestion = await loadNoteEntriesByQuestion(userId, [
    attempt.question_id as string,
  ])
  const noteEntries = entriesByQuestion.get(attempt.question_id as string) ?? []
  const userNote = combineNoteBodies(noteEntries)
  const topic = (qu.tec_topic as string | null)?.trim() || "Sem tópico"
  const isCorrect = Boolean(attempt.is_correct)
  const outcome = (attempt.outcome_category as string) ?? "conhecimento_solido"
  const confidence = (attempt.confidence_level as string) ?? "seguro"
  const statement = (qu.statement as string) ?? ""
  const zone = classifyAuditZone({
    is_correct: isCorrect,
    outcome_category: outcome,
    confidence_level: confidence,
    user_note: userNote,
  })

  const question: NotebookAuditQuestion = {
    question_index: 1,
    question_id: attempt.question_id as string,
    attempt_id: attempt.id as string,
    tec_id: Number(qu.tec_id) || 0,
    tec_topic: topic,
    banca: (qu.banca as string | null) ?? null,
    ano: (qu.ano as number | null) ?? null,
    orgao: (qu.orgao as string | null) ?? null,
    header_label: buildQuestionHeaderLabel({
      banca: (qu.banca as string | null) ?? null,
      ano: (qu.ano as number | null) ?? null,
      orgao: (qu.orgao as string | null) ?? null,
      tec_topic: topic,
      question_index: 1,
    }),
    statement,
    statement_excerpt: statement.slice(0, 800),
    selected_answer: (attempt.selected_answer as string) ?? "—",
    correct_answer: (qu.correct_answer as string) ?? "—",
    is_correct: isCorrect,
    outcome_category: outcome,
    confidence_level: confidence,
    duration_ms: attempt.duration_ms == null ? null : Number(attempt.duration_ms),
    user_note: userNote,
    note_entries: noteEntries,
    zone,
    ...feedbackFromErrorDetail(attempt.error_detail),
  }

  const groups = {
    red: zone === "red" ? 1 : 0,
    yellow: zone === "yellow" ? 1 : 0,
    green: zone === "green" ? 1 : 0,
  }

  return {
    notebook_id: notebookId,
    notebook_name: notebookName,
    subject_name: subjectName,
    questions: [question],
    performance_summary: {
      correct: isCorrect ? 1 : 0,
      total: 1,
      pct: isCorrect ? 100 : 0,
      avg_duration_ms: question.duration_ms && question.duration_ms > 0 ? question.duration_ms : 0,
      groups,
    },
  }
}
