import { supabaseServer } from "../supabase-server"
import type {
  BehavioralAuditQuestionItem,
  NotebookReportStructured,
  PerQuestionError,
  SubjectBrainState,
} from "../coach-types"
import { loadSubjectBrain } from "./context-builder"
import { topicBrainKey } from "./brain-helpers"
import { computeLearningSignals } from "../learning-signals"
import { loadMappings, isSubjectLevelMapping } from "../tec-mapping"
import { loadNoteEntriesByQuestion } from "../question-notes"
import {
  dedupeDossierErrors,
  richnessScore,
  type DossierErrorRecord,
} from "./subject-dossier-helpers"
import {
  buildIncidenceTopicIndex,
  getActiveExamTargetId,
  getEditalWeightForSubject,
  percentToIncidenceWeight,
} from "../strategic-weights"
import { fetchIncidenceRows, resolveSubjectLabels } from "../incidence-rows-db"

const EVOLUTION_SOLID_STREAK = 2

export type { DossierErrorRecord } from "./subject-dossier-helpers"
export { dedupeDossierErrors, mergeDossierErrorRecords } from "./subject-dossier-helpers"

export type DossierEvolutionCandidate = {
  topic: string
  topic_key: string
  question_id: string
  previous_misconception?: string
  solid_streak: number
  last_outcomes: string[]
  brain_status?: string
  dominio_delta?: number
}

export type DossierAnnotationInput = {
  question_id: string
  note_body: string
  cached_feedback?: string
  tec_topic?: string
  statement_excerpt?: string
}

export type SubjectDossierPayload = {
  subject_id: string
  subject_name: string
  source_report_ids: string[]
  brain: SubjectBrainState | null
  aggregated_errors: DossierErrorRecord[]
  evolution_candidates: DossierEvolutionCandidate[]
  annotations: DossierAnnotationInput[]
  learning_signals: { type: string; entity: string; score: number }[]
  incidence_top_topics: { topic: string; weight: number }[]
  edital_weight: number
}

function perQuestionToPartial(
  eq: PerQuestionError,
  reportId: string
): DossierErrorRecord {
  return {
    question_id: eq.question_id,
    tec_id: eq.tec_id,
    tec_topic: eq.tec_topic,
    error_taxonomy: eq.error_taxonomy,
    specific_mistake: eq.specific_mistake,
    misconception: eq.misconception,
    feedback_detailed: eq.feedback_detailed ?? eq.explanation,
    user_note: eq.user_note ?? eq.note_body,
    statement_excerpt: eq.statement_excerpt,
    report_ids: [reportId],
    recurrence: 1,
    richness_score: richnessScore(eq),
  }
}

function auditItemToPartial(
  item: BehavioralAuditQuestionItem,
  reportId: string,
  tecTopic?: string
): DossierErrorRecord | null {
  if (!item.question_id) return null
  return {
    question_id: item.question_id,
    tec_topic: tecTopic,
    error_taxonomy: item.error_taxonomy,
    specific_mistake: item.misconception,
    misconception: item.misconception,
    feedback_detailed: item.feedback,
    user_note: item.note_body ?? item.user_note,
    statement_excerpt: item.statement_excerpt,
    report_ids: [reportId],
    recurrence: 1,
    richness_score: richnessScore(item),
  }
}

export function extractErrorsFromReport(
  structured: NotebookReportStructured,
  reportId: string,
  perQuestionById: Map<string, PerQuestionError>
): DossierErrorRecord[] {
  const rows: DossierErrorRecord[] = []

  for (const eq of structured.per_question_errors ?? []) {
    if (!eq.question_id) continue
    rows.push(perQuestionToPartial(eq, reportId))
    perQuestionById.set(eq.question_id, eq)
  }

  const audit = structured.behavioral_audit
  if (audit) {
    const zones: BehavioralAuditQuestionItem[][] = [
      audit.red_zone ?? [],
      audit.yellow_zone ?? [],
      ...(audit.green_zone?.note_clarifications
        ? [audit.green_zone.note_clarifications]
        : []),
    ]
    for (const zoneItems of zones) {
      for (const item of zoneItems) {
        const perQ = perQuestionById.get(item.question_id)
        const partial = auditItemToPartial(
          item,
          reportId,
          perQ?.tec_topic
        )
        if (partial) rows.push(partial)
      }
    }
  }

  return rows
}

type AttemptTimelineRow = {
  question_id: string
  is_correct: boolean
  outcome_category: string | null
  confidence_level: string | null
  created_at: string
  questions: { tec_topic?: string } | null
}

async function fetchAttemptTimelines(
  userId: string,
  questionIds: string[]
): Promise<Map<string, AttemptTimelineRow[]>> {
  const map = new Map<string, AttemptTimelineRow[]>()
  if (!questionIds.length) return map

  const { data } = await supabaseServer
    .from("question_attempts")
    .select(
      `
      question_id, is_correct, outcome_category, confidence_level, created_at,
      questions ( tec_topic )
    `
    )
    .eq("user_id", userId)
    .in("question_id", questionIds)
    .order("created_at", { ascending: true })

  for (const row of data ?? []) {
    const q = row.questions as { tec_topic?: string } | { tec_topic?: string }[] | null
    const qu = Array.isArray(q) ? q[0] : q
    const list = map.get(row.question_id) ?? []
    list.push({
      ...row,
      questions: qu ?? null,
    })
    map.set(row.question_id, list)
  }
  return map
}

export function detectEvolutionCandidates(params: {
  errors: DossierErrorRecord[]
  timelines: Map<string, AttemptTimelineRow[]>
  brain: SubjectBrainState | null
}): DossierEvolutionCandidate[] {
  const candidates: DossierEvolutionCandidate[] = []
  const strongStatuses = new Set(["dominado", "forte"])

  for (const err of params.errors) {
    const timeline = params.timelines.get(err.question_id) ?? []
    if (timeline.length < EVOLUTION_SOLID_STREAK + 1) continue

    const lastN = timeline.slice(-EVOLUTION_SOLID_STREAK)
    const allSolid = lastN.every(
      (a) =>
        a.is_correct &&
        (a.outcome_category === "conhecimento_solido" ||
          a.confidence_level === "seguro")
    )
    if (!allSolid) continue

    const topic =
      err.tec_topic?.trim() ||
      timeline[timeline.length - 1]?.questions?.tec_topic?.trim() ||
      "Sem tópico"
    const key = topicBrainKey(topic)
    const entry = params.brain?.topic_map[key]
    const dominioDelta = params.brain?.dominio_delta?.[key]

    const topicStrong =
      (entry && strongStatuses.has(entry.status)) ||
      (dominioDelta != null && dominioDelta > 0.05)

    if (!topicStrong && lastN.length < EVOLUTION_SOLID_STREAK) continue

    candidates.push({
      topic,
      topic_key: key,
      question_id: err.question_id,
      previous_misconception:
        err.misconception ?? err.specific_mistake ?? err.feedback_detailed?.slice(0, 200),
      solid_streak: lastN.length,
      last_outcomes: lastN.map((a) => a.outcome_category ?? (a.is_correct ? "acerto" : "erro")),
      brain_status: entry?.status,
      dominio_delta: dominioDelta,
    })
  }

  const seenTopic = new Set<string>()
  return candidates.filter((c) => {
    if (seenTopic.has(c.topic_key)) return false
    seenTopic.add(c.topic_key)
    return true
  })
}

export async function buildSubjectDossierPayload(
  userId: string,
  subjectId: string
): Promise<SubjectDossierPayload | null> {
  const { data: subject } = await supabaseServer
    .from("subjects")
    .select("name")
    .eq("id", subjectId)
    .maybeSingle()

  const { data: reports } = await supabaseServer
    .from("subject_notebook_reports")
    .select("id, structured, created_at")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: true })

  if (!reports?.length) return null

  const perQuestionById = new Map<string, PerQuestionError>()
  let allRows: DossierErrorRecord[] = []
  const sourceReportIds: string[] = []

  for (const r of reports) {
    sourceReportIds.push(r.id)
    const structured = r.structured as NotebookReportStructured
    allRows.push(...extractErrorsFromReport(structured, r.id, perQuestionById))
  }

  const aggregated_errors = dedupeDossierErrors(allRows).filter(
    (e) => e.error_taxonomy || e.feedback_detailed || e.specific_mistake || e.misconception
  )

  if (!aggregated_errors.length) return null

  const brain = await loadSubjectBrain(userId, subjectId)
  const questionIds = aggregated_errors.map((e) => e.question_id)
  const timelines = await fetchAttemptTimelines(userId, questionIds)
  const evolution_candidates = detectEvolutionCandidates({
    errors: aggregated_errors,
    timelines,
    brain,
  })

  const noteEntries = await loadNoteEntriesByQuestion(userId, questionIds)
  const annotations: DossierAnnotationInput[] = []
  for (const [qid, entries] of noteEntries) {
    const bodies = entries.map((e) => e.body.trim()).filter(Boolean)
    if (!bodies.length) continue
    const err = aggregated_errors.find((e) => e.question_id === qid)
    const cached = entries
      .map((e) => e.ai_feedback?.trim())
      .filter(Boolean)
      .join("\n\n")
    annotations.push({
      question_id: qid,
      note_body: bodies.join("\n---\n"),
      cached_feedback: cached || undefined,
      tec_topic: err?.tec_topic,
      statement_excerpt: err?.statement_excerpt,
    })
  }

  const signals = await computeLearningSignals(userId, subjectId)
  const learning_signals = signals.slice(0, 15).map((s) => ({
    type: s.signal_type,
    entity: s.entity_id,
    score: s.score,
  }))

  let incidence_top_topics: { topic: string; weight: number }[] = []
  let edital_weight = 1
  try {
    const examId = await getActiveExamTargetId(userId)
    if (examId) {
      edital_weight = await getEditalWeightForSubject(userId, examId, subjectId)
      const labels = await resolveSubjectLabels(userId, examId, subjectId).catch(
        () => [] as string[]
      )
      if (labels.length) {
        const rows = await fetchIncidenceRows({
          userId,
          examTargetId: examId,
          subjectLabels: labels,
        })
        const topicIndex = buildIncidenceTopicIndex(
          (rows ?? []).map((r) => ({
            topic_name: String(r.topic_name),
            percent: Number(r.percent),
            is_subtopic: Boolean(r.is_subtopic),
          }))
        )
        incidence_top_topics = [...topicIndex.entries()]
          .map(([name, entry]) => ({
            topic: name,
            weight: percentToIncidenceWeight(entry.percent),
          }))
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 10)
      }
    }
  } catch {
    /* optional context */
  }

  const mappings = await loadMappings(userId)
  const hasMapping = mappings.some(
    (m) => m.subject_id === subjectId && isSubjectLevelMapping(m.tec_topic)
  )
  if (!hasMapping && !aggregated_errors.length) return null

  return {
    subject_id: subjectId,
    subject_name: subject?.name ?? "Matéria",
    source_report_ids: sourceReportIds,
    brain,
    aggregated_errors: aggregated_errors.slice(0, 40),
    evolution_candidates,
    annotations: annotations.slice(0, 20),
    learning_signals,
    incidence_top_topics,
    edital_weight,
  }
}

/** Compact payload for LLM (token control). */
export function compactDossierPayloadForLlm(
  payload: SubjectDossierPayload,
  extras?: {
    precomputed_clarifications?: {
      question_id: string
      note_body: string
      answer_md: string
      linked_topics?: string[]
    }[]
  }
): Record<string, unknown> {
  return {
    subject_name: payload.subject_name,
    brain_summary: payload.brain
      ? {
          trend: payload.brain.trend,
          danger_topics: payload.brain.danger_topics.slice(0, 8),
          topic_map: Object.fromEntries(
            Object.entries(payload.brain.topic_map)
              .slice(0, 25)
              .map(([k, v]) => [
                k,
                {
                  label: v.label ?? k,
                  status: v.status,
                  dominio: v.dominio,
                  last_insight: v.last_insight?.slice(0, 200),
                  predominant_error: v.predominant_error,
                },
              ])
          ),
          dominio_delta: payload.brain.dominio_delta,
        }
      : null,
    errors: payload.aggregated_errors.map((e) => ({
      question_id: e.question_id,
      tec_id: e.tec_id,
      tec_topic: e.tec_topic,
      error_taxonomy: e.error_taxonomy,
      specific_mistake: e.specific_mistake?.slice(0, 200),
      misconception: e.misconception?.slice(0, 200),
      feedback_excerpt: e.feedback_detailed?.slice(0, 400),
      user_note: e.user_note?.slice(0, 200),
      statement_excerpt: e.statement_excerpt?.slice(0, 200),
      report_ids: e.report_ids,
      recurrence: e.recurrence,
    })),
    evolution_candidates: payload.evolution_candidates,
    annotations: payload.annotations.map((a) => ({
      question_id: a.question_id,
      note_body: a.note_body.slice(0, 1200),
      cached_feedback: a.cached_feedback?.slice(0, 800),
      tec_topic: a.tec_topic,
      statement_excerpt: a.statement_excerpt?.slice(0, 400),
    })),
    precomputed_clarifications: extras?.precomputed_clarifications ?? [],
    learning_signals: payload.learning_signals,
    incidence_top_topics: payload.incidence_top_topics,
    edital_weight: payload.edital_weight,
  }
}
