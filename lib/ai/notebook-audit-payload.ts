import { supabaseServer } from "../supabase-server"
import type { AuditZone } from "../coach-types"

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
  zone: AuditZone
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
      "id, question_id, selected_answer, is_correct, outcome_category, confidence_level, duration_ms, created_at"
    )
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)
    .order("created_at", { ascending: true })

  const latestAttemptByQ = new Map<string, NonNullable<typeof attempts>[number]>()
  for (const a of attempts ?? []) {
    latestAttemptByQ.set(a.question_id, a)
  }

  const notesByQuestion = new Map<string, string>()
  if (questionIds.length) {
    const { data: notes } = await supabaseServer
      .from("question_notes")
      .select("question_id, note")
      .eq("user_id", userId)
      .in("question_id", questionIds)
    for (const n of notes ?? []) {
      const text = String(n.note ?? "").trim()
      if (text) notesByQuestion.set(n.question_id, text)
    }
  }

  const questions: NotebookAuditQuestion[] = []
  let index = 0

  for (const row of nqRows ?? []) {
    index++
    const qu = unwrap(row.questions)
    if (!qu) continue

    const att = latestAttemptByQ.get(row.question_id)
    const userNote = notesByQuestion.get(row.question_id) ?? ""
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
      zone,
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
