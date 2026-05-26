import { supabaseServer } from "../supabase-server"
import type { ErrorTaxonomy, PerQuestionError, SubjectBrainState } from "../coach-types"
import { findTopicEntry } from "./brain-helpers"
import { loadSubjectBrain } from "./context-builder"
import { runAgent } from "./run-agent"
import { fetchIncidenceRows, resolveSubjectLabels } from "../incidence-rows-db"
import {
  buildIncidenceTopicIndex,
  computeErrorPriorityScore,
  getActiveExamTargetId,
  getEditalWeightForSubject,
  matchTopicToIncidence,
} from "../strategic-weights"

export type WrongAttemptRow = {
  attempt_id: string
  question_id: string
  duration_ms: number | null
  outcome_category: string | null
  confidence_level: string | null
  selected_answer: string
  correct_answer: string
  tec_id: number
  tec_topic: string
  statement: string
  banca: string | null
  ano: number | null
  orgao: string | null
  user_note: string
  notes: string[]
  prior_correct_count: number
  priority_score: number
  incidence_weight?: number
  edital_weight?: number
  matched_incidence_topic?: string | null
}

const TAXONOMY_SEVERITY: Record<ErrorTaxonomy, number> = {
  falta_compreensao: 4,
  calculo_procedimento: 4,
  falta_memorizacao: 3,
  pegadinha_interpretacao: 2,
  desatencao: 1,
  nao_aplicavel: 0,
}

export function heuristicClassify(row: WrongAttemptRow): {
  taxonomy: ErrorTaxonomy
  evidence: string[]
  specific_mistake?: string
} {
  const evidence: string[] = []
  const dur = row.duration_ms ?? 0

  if (dur < 25_000 && row.confidence_level === "seguro") {
    evidence.push("Resposta rápida com confiança alta")
    return { taxonomy: "desatencao", evidence }
  }

  if (row.outcome_category === "falso_positivo" || row.confidence_level === "chute") {
    evidence.push("Padrão de chute ou falso positivo")
    return { taxonomy: "pegadinha_interpretacao", evidence }
  }

  if (row.prior_correct_count >= 2) {
    evidence.push("Já acertou esta questão antes")
    return { taxonomy: "desatencao", evidence }
  }

  if (dur > 120_000) {
    evidence.push("Tempo elevado na questão")
    return { taxonomy: "falta_compreensao", evidence }
  }

  if (
    row.outcome_category === "lacuna_critica" ||
    row.outcome_category === "conteudo_desconhecido"
  ) {
    evidence.push("Lacuna de conteúdo registrada")
    return { taxonomy: "falta_memorizacao", evidence }
  }

  if (row.outcome_category === "lacuna_consciente") {
    return { taxonomy: "falta_compreensao", evidence: ["Lacuna consciente"] }
  }

  return { taxonomy: "pegadinha_interpretacao", evidence: ["Padrão interpretativo"] }
}

async function loadWeightContext(userId: string, subjectId: string | null) {
  const examId = await getActiveExamTargetId(userId)
  if (!examId || !subjectId) {
    return { examId: null as string | null, editalWeight: 1, topicIndex: buildIncidenceTopicIndex([]) }
  }

  const [editalWeight, labels] = await Promise.all([
    getEditalWeightForSubject(userId, examId, subjectId),
    resolveSubjectLabels(userId, examId, subjectId).catch(() => [] as string[]),
  ])

  const rows =
    labels.length > 0
      ? await fetchIncidenceRows({
          userId,
          examTargetId: examId,
          subjectLabels: labels,
        })
      : []

  const topicIndex = buildIncidenceTopicIndex(
    (rows ?? []).map((r) => ({
      topic_name: String(r.topic_name),
      percent: Number(r.percent),
      is_subtopic: Boolean(r.is_subtopic),
    }))
  )

  return { examId, editalWeight, topicIndex }
}

export async function fetchWrongAttemptsForNotebook(
  userId: string,
  notebookId: string,
  subjectId: string | null
): Promise<WrongAttemptRow[]> {
  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select(
      `
      id, question_id, duration_ms, outcome_category, confidence_level, is_correct, selected_answer,
      questions ( tec_id, tec_topic, statement, correct_answer, banca, ano, orgao )
    `
    )
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)
    .eq("is_correct", false)
    .order("created_at", { ascending: false })

  const brain = subjectId ? await loadSubjectBrain(userId, subjectId) : null
  const weights = await loadWeightContext(userId, subjectId)

  const questionIds = [...new Set((attempts ?? []).map((a) => a.question_id))]
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

  const rows: WrongAttemptRow[] = []
  const seenQ = new Set<string>()

  for (const a of attempts ?? []) {
    if (seenQ.has(a.question_id)) continue
    seenQ.add(a.question_id)

    const q = a.questions as
      | {
          tec_id: number
          tec_topic: string
          statement: string
          correct_answer: string
          banca: string | null
          ano: number | null
          orgao: string | null
        }
      | {
          tec_id: number
          tec_topic: string
          statement: string
          correct_answer: string
          banca: string | null
          ano: number | null
          orgao: string | null
        }[]
    const qu = Array.isArray(q) ? q[0] : q
    if (!qu) continue

    const userNote = notesByQuestion.get(a.question_id) ?? ""

    const { count: priorCorrect } = await supabaseServer
      .from("question_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("question_id", a.question_id)
      .eq("is_correct", true)
      .neq("notebook_id", notebookId)

    const topic = qu.tec_topic?.trim() || "Sem tópico"
    const entry = brain?.topic_map?.[topic]
    const brainGap = entry ? 1 - entry.dominio : 0.5

    const incidenceMatch = matchTopicToIncidence(topic, weights.topicIndex)
    const incidenceWeight = incidenceMatch.weight
    const editalWeight = weights.editalWeight

    const { taxonomy } = heuristicClassify({
      attempt_id: a.id,
      question_id: a.question_id,
      duration_ms: a.duration_ms,
      outcome_category: a.outcome_category,
      confidence_level: a.confidence_level,
      selected_answer: a.selected_answer ?? "",
      correct_answer: qu.correct_answer ?? "",
      tec_id: qu.tec_id,
      tec_topic: topic,
      statement: qu.statement ?? "",
      banca: qu.banca,
      ano: qu.ano,
      orgao: qu.orgao,
      user_note: userNote,
      notes: userNote ? [userNote] : [],
      prior_correct_count: priorCorrect ?? 0,
      priority_score: 0,
    })

    const priority_score = computeErrorPriorityScore({
      wrongCount: 1,
      incidenceWeight,
      editalWeight,
      brainGap,
      taxonomySeverity: TAXONOMY_SEVERITY[taxonomy],
    })

    rows.push({
      attempt_id: a.id,
      question_id: a.question_id,
      duration_ms: a.duration_ms,
      outcome_category: a.outcome_category,
      confidence_level: a.confidence_level,
      selected_answer: a.selected_answer ?? "",
      correct_answer: qu.correct_answer ?? "",
      tec_id: qu.tec_id,
      tec_topic: topic,
      statement: (qu.statement ?? "").slice(0, 800),
      banca: qu.banca,
      ano: qu.ano,
      orgao: qu.orgao,
      user_note: userNote,
      notes: userNote ? [userNote] : [],
      prior_correct_count: priorCorrect ?? 0,
      priority_score,
      incidence_weight: incidenceWeight,
      edital_weight: editalWeight,
      matched_incidence_topic: incidenceMatch.matchedTopic,
    })
  }

  return rows.sort((a, b) => b.priority_score - a.priority_score)
}

export async function classifyWrongAttempts(
  userId: string,
  notebookId: string,
  subjectId: string | null,
  _options?: { explain?: boolean }
): Promise<PerQuestionError[]> {
  const rows = await fetchWrongAttemptsForNotebook(userId, notebookId, subjectId)
  const brain = subjectId ? await loadSubjectBrain(userId, subjectId) : null

  const prepared: {
    row: WrongAttemptRow
    item: PerQuestionError
    errorDetail: Record<string, unknown>
  }[] = []

  for (const row of rows) {
    const { taxonomy, evidence, specific_mistake } = heuristicClassify(row)
    const brainFound = brain?.topic_map
      ? findTopicEntry(brain.topic_map, row.tec_topic)
      : null
    const brainEntry = brainFound?.[1]

    const errorDetail = {
      specific_mistake,
      evidence,
      source: "heuristic" as const,
      priority_score: row.priority_score,
      incidence_weight: row.incidence_weight,
      edital_weight: row.edital_weight,
      matched_incidence_topic: row.matched_incidence_topic,
      brain_topic_status: brainEntry?.status,
    }

    await supabaseServer
      .from("question_attempts")
      .update({
        error_taxonomy: taxonomy,
        error_detail: errorDetail,
      })
      .eq("id", row.attempt_id)

    const item: PerQuestionError = {
      question_id: row.question_id,
      attempt_id: row.attempt_id,
      tec_id: row.tec_id,
      tec_topic: row.tec_topic,
      error_taxonomy: taxonomy,
      priority_score: row.priority_score,
      specific_mistake,
      evidence,
      brain_topic_status: brainEntry?.status,
      marked_answer: row.selected_answer,
      correct_answer: row.correct_answer,
      user_note: row.user_note || undefined,
      statement_excerpt: row.statement.slice(0, 400),
      outcome_category: row.outcome_category ?? undefined,
      confidence_level: row.confidence_level ?? undefined,
      zone: "red",
    }

    prepared.push({ row, item, errorDetail })
  }

  return prepared.map((p) => p.item)
}

export async function refineTaxonomyWithLlm(
  userId: string,
  rows: WrongAttemptRow[]
): Promise<Map<string, ErrorTaxonomy>> {
  const result = await runAgent({
    agentType: "report",
    userId,
    systemPrompt: `Classifique cada erro em UMA categoria: desatencao, pegadinha_interpretacao, falta_compreensao, calculo_procedimento, falta_memorizacao.
Responda JSON: { "items": [{"question_id":"","error_taxonomy":"","specific_mistake":""}] }`,
    userContent: JSON.stringify(rows.slice(0, 20)),
    jsonMode: true,
    maxTokens: 1500,
  })

  const map = new Map<string, ErrorTaxonomy>()
  if (!result.usedLlm) return map

  try {
    const parsed = JSON.parse(result.text) as {
      items?: { question_id: string; error_taxonomy: ErrorTaxonomy; specific_mistake?: string }[]
    }
    for (const item of parsed.items ?? []) {
      map.set(item.question_id, item.error_taxonomy)
    }
  } catch {
    /* keep heuristics */
  }
  return map
}
