import { supabaseServer } from "../supabase-server"
import type { NotebookReportStructured, PerQuestionError } from "../coach-types"
import { classifyWrongAttempts } from "./error-classifier"
import {
  mergeBehavioralAuditIntoErrors,
  runBehavioralAuditForNotebook,
} from "./agents/behavioral-audit"
import { runReportAgent } from "./agents/report"
import { loadSubjectBrain } from "./context-builder"
import { getEffectiveReportPreferences } from "./context-builder"
import { computeLearningSignals } from "../learning-signals"
import {
  buildDeterministicMetacognition,
  buildDeterministicTimeInsights,
  buildRuleBasedExecutableActions,
  countReportLlmRunsToday,
} from "./report-helpers"
import {
  buildIncidenceTopicIndex,
  getActiveExamTargetId,
  getEditalWeightForSubject,
  percentToIncidenceWeight,
} from "../strategic-weights"
import { fetchIncidenceRows, resolveSubjectLabels } from "../incidence-rows-db"

function unwrapQuestion(
  q: { tec_id: number; tec_topic: string; statement: string } | { tec_id: number; tec_topic: string; statement: string }[] | null
) {
  if (!q) return null
  return Array.isArray(q) ? q[0] ?? null : q
}

export async function buildNotebookReportSnapshot(
  notebookId: string,
  userId: string
) {
  const { data: nb, error: nbErr } = await supabaseServer
    .from("notebooks")
    .select("id, name, subject_id, question_count, study_elapsed_ms, completed_at")
    .eq("id", notebookId)
    .eq("user_id", userId)
    .single()

  if (nbErr || !nb) throw new Error("Caderno não encontrado")

  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select(
      `
      question_id, is_correct, duration_ms, outcome_category, confidence_level, created_at, error_taxonomy,
      questions ( tec_id, tec_subject, tec_topic, statement )
    `
    )
    .eq("user_id", userId)
    .eq("notebook_id", notebookId)
    .order("created_at", { ascending: true })

  type AttemptRow = NonNullable<typeof attempts>[number]
  const byQuestion = new Map<string, AttemptRow[]>()
  const questionIds = new Set<string>()
  for (const a of attempts ?? []) {
    questionIds.add(a.question_id)
    const list = byQuestion.get(a.question_id) ?? []
    list.push(a)
    byQuestion.set(a.question_id, list)
  }

  const byTopic = new Map<string, { correct: number; wrong: number; durations: number[] }>()
  const outcomeCounts = new Map<string, number>()
  const recurring: { tec_id: number; attempts: number }[] = []
  const timelines: Record<string, unknown>[] = []

  for (const [qid, rows] of byQuestion) {
    const last = rows[rows.length - 1]!
    const q = unwrapQuestion(
      last.questions as Parameters<typeof unwrapQuestion>[0]
    )
    const topic = q?.tec_topic?.trim() || "Sem tópico"
    const g = byTopic.get(topic) ?? { correct: 0, wrong: 0, durations: [] }
    if (last.is_correct) g.correct++
    else g.wrong++
    if (last.duration_ms) g.durations.push(last.duration_ms)
    byTopic.set(topic, g)

    for (const r of rows) {
      const oc = r.outcome_category ?? "unknown"
      outcomeCounts.set(oc, (outcomeCounts.get(oc) ?? 0) + 1)
    }

    const wrongCount = rows.filter((r) => !r.is_correct).length
    if (wrongCount >= 2 && q) {
      recurring.push({ tec_id: q.tec_id, attempts: wrongCount })
    }

    if (rows.length >= 2) {
      timelines.push({
        question_id: qid,
        tec_id: q?.tec_id,
        attempts_count: rows.length,
        wrong_count: wrongCount,
        attempts_timeline: rows.slice(-5).map((r) => ({
          at: r.created_at,
          duration_sec: Math.round((r.duration_ms ?? 0) / 1000),
          outcome: r.outcome_category,
          correct: r.is_correct,
        })),
      })
    }
  }

  let subjectName = ""
  if (nb.subject_id) {
    const { data: sub } = await supabaseServer
      .from("subjects")
      .select("name")
      .eq("id", nb.subject_id)
      .single()
    subjectName = sub?.name ?? ""
  }

  const qIds = [...questionIds]
  let notes_sample: { content: string }[] = []
  if (qIds.length) {
    const { data: notes } = await supabaseServer
      .from("question_notes")
      .select("note, question_id")
      .eq("user_id", userId)
      .in("question_id", qIds.slice(0, 50))
      .limit(10)
    notes_sample = (notes ?? []).map((n) => ({
      content: String(n.note ?? "").slice(0, 200),
      question_id: n.question_id,
    }))
  }

  const base = {
    notebook_id: notebookId,
    notebook_name: nb.name,
    subject_id: nb.subject_id,
    subject_name: subjectName,
    question_count: nb.question_count,
    study_elapsed_ms: nb.study_elapsed_ms,
    completed_at: nb.completed_at,
    by_topic: [...byTopic.entries()].map(([topic, g]) => ({
      topic,
      correct: g.correct,
      wrong: g.wrong,
      avg_duration_ms: g.durations.length
        ? Math.round(g.durations.reduce((s, d) => s + d, 0) / g.durations.length)
        : 0,
    })),
    outcome_breakdown: [...outcomeCounts.entries()].map(([outcome, count]) => ({
      outcome,
      count,
    })),
    recurring_failures: recurring.sort((a, b) => b.attempts - a.attempts).slice(0, 15),
    multi_attempt_questions: timelines.slice(0, 15),
    notes_sample,
  }

  return enrichNotebookSnapshot(userId, nb.subject_id, base)
}

async function enrichNotebookSnapshot(
  userId: string,
  subjectId: string | null,
  base: Record<string, unknown>
) {
  const enriched = { ...base } as Record<string, unknown>

  if (subjectId) {
    const brain = await loadSubjectBrain(userId, subjectId)
    enriched.subject_brain = brain

    const signals = await computeLearningSignals(userId, subjectId)
    enriched.learning_signals = signals.slice(0, 12).map((s) => ({
      type: s.signal_type,
      entity: s.entity_id,
      score: s.score,
    }))

    const { data: priorReport } = await supabaseServer
      .from("subject_notebook_reports")
      .select("structured, created_at")
      .eq("user_id", userId)
      .eq("subject_id", subjectId)
      .neq("notebook_id", base.notebook_id as string)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const priorStructured = priorReport?.structured as
      | { headline?: string }
      | undefined
    enriched.prior_report_headline = priorStructured?.headline ?? null

    try {
      const examId = await getActiveExamTargetId(userId)
      if (examId) {
        const labels = await resolveSubjectLabels(userId, examId, subjectId).catch(
          () => [] as string[]
        )
        const editalWeight = await getEditalWeightForSubject(userId, examId, subjectId)
        enriched.edital_weight = editalWeight

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
          enriched.incidence_top_topics = [...topicIndex.entries()]
            .map(([name, entry]) => ({
              topic: name,
              percent: entry.percent,
              weight: percentToIncidenceWeight(entry.percent),
            }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 10)
        }
      }
    } catch {
      enriched.incidence_top_topics = []
    }
  }

  return enriched
}

export function buildRuleBasedReport(
  snapshot: Record<string, unknown>,
  options: {
    useLlm: boolean
    perQuestionErrors: PerQuestionError[]
    learningSignals?: { type: string; entity: string; score: number }[]
    behavioralAudit?: import("../coach-types").BehavioralAudit
  }
): NotebookReportStructured {
  const byTopic =
    (snapshot.by_topic as {
      topic: string
      wrong: number
      correct: number
      avg_duration_ms?: number
    }[]) ?? []
  const weak = [...byTopic].sort((a, b) => b.wrong - a.wrong).slice(0, 5)
  const strong = [...byTopic].filter((t) => t.wrong === 0 && t.correct > 0).slice(0, 3)
  const recurring = (snapshot.recurring_failures as { tec_id: number; attempts: number }[]) ?? []

  const signals = (options.learningSignals ?? []).map((s) => ({
    signal_type: s.type as import("../coach-types").LearningSignalType,
    entity_type: "tec_topic" as const,
    entity_id: s.entity,
    score: s.score,
    metadata: {},
  }))

  const subjectId = snapshot.subject_id as string | null

  const topError = options.perQuestionErrors[0]
  const headline = topError?.tec_topic
    ? `Foco em ${topError.tec_topic}: erro ${topError.error_taxonomy ?? "classificado"} (prioridade ${Math.round(topError.priority_score ?? 0)}).`
    : weak[0]
      ? `Foco em ${weak[0].topic}: ${weak[0].wrong} erros neste caderno.`
      : "Caderno concluído — bom desempenho geral."

  return {
    headline,
    strengths: strong.map((t) => ({
      topic: t.topic,
      evidence: `${t.correct} acertos sem erros no período analisado.`,
    })),
    weaknesses: weak
      .filter((t) => t.wrong > 0)
      .map((t) => ({
        topic: t.topic,
        evidence: `${t.wrong} erros`,
        severity: t.wrong >= 5 ? "alta" : t.wrong >= 2 ? "media" : "baixa",
      })),
    time_insights: buildDeterministicTimeInsights(byTopic),
    metacognition_patterns: buildDeterministicMetacognition(snapshot, signals),
    recurring_failures: recurring.map((r) => ({
      tec_id: r.tec_id,
      attempts: r.attempts,
      advice: "Incluir no caderno de reforço.",
    })),
    consolidated_topics: strong.map((t) => t.topic),
    actions_next_7_days: [
      {
        action: weak[0] ? `Reforçar ${weak[0].topic}` : "Manter ritmo de estudo",
        priority: 1,
        minutes_estimate: 45,
      },
      ...(weak[1]
        ? [
            {
              action: `Revisar ${weak[1].topic}`,
              priority: 2,
              minutes_estimate: 30,
            },
          ]
        : []),
    ],
    executable_actions: buildRuleBasedExecutableActions(
      snapshot,
      options.perQuestionErrors,
      subjectId
    ),
    per_question_errors: options.perQuestionErrors,
    behavioral_audit: options.behavioralAudit,
    confidence_in_analysis: options.useLlm ? "media" : "alta",
  }
}

export async function generateNotebookReport(
  notebookId: string,
  userId: string,
  options?: { force?: boolean }
): Promise<{
  structured: NotebookReportStructured
  summaryMd: string
  snapshot: Record<string, unknown>
  modelUsed: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  perQuestionCount: number
  usedLlm: boolean
}> {
  const { data: nb } = await supabaseServer
    .from("notebooks")
    .select("subject_id, name")
    .eq("id", notebookId)
    .single()

  const subjectId = nb?.subject_id ?? null
  const prefs = await getEffectiveReportPreferences(userId, subjectId)

  let perQuestionErrors = await classifyWrongAttempts(
    userId,
    notebookId,
    subjectId,
    { explain: prefs.explain_wrong }
  )

  const reportsToday = await countReportLlmRunsToday(userId)
  const skipAuditLlm = reportsToday >= prefs.max_llm_explanations_per_day

  const auditResult = await runBehavioralAuditForNotebook(
    notebookId,
    userId,
    subjectId,
    { skipLlm: skipAuditLlm }
  )
  perQuestionErrors = mergeBehavioralAuditIntoErrors(
    perQuestionErrors,
    auditResult.audit,
    auditResult.payload
  )

  const snapshot = await buildNotebookReportSnapshot(notebookId, userId)
  const learningSignals = (snapshot.learning_signals ?? []) as {
    type: string
    entity: string
    score: number
  }[]

  const ruleBased = buildRuleBasedReport(snapshot, {
    useLlm: true,
    perQuestionErrors,
    learningSignals,
    behavioralAudit: auditResult.audit,
  })

  const brain = subjectId
    ? ((snapshot.subject_brain as Record<string, unknown> | null) ?? null)
    : null

  const skipLlm =
    skipAuditLlm ||
    (auditResult.usedLlm
      ? reportsToday + 1 >= prefs.max_llm_explanations_per_day
      : reportsToday >= prefs.max_llm_explanations_per_day)

  const materialHints: { topic: string; document_title: string; excerpt: string }[] =
    []
  if (subjectId) {
    const { retrieveForTeacher } = await import("./teacher-retrieval")
    for (const w of ruleBased.weaknesses?.slice(0, 3) ?? []) {
      const topic = w.topic?.trim()
      if (!topic) continue
      const chunks = await retrieveForTeacher(userId, subjectId, topic, 1)
      const c = chunks[0]
      if (c) {
        materialHints.push({
          topic,
          document_title: c.title,
          excerpt: c.content.slice(0, 350),
        })
      }
    }
  }

  const result = await runReportAgent({
    userId,
    subjectId,
    snapshot,
    brain,
    perQuestionErrors,
    ruleBased,
    skipLlm,
    notebookName: String(snapshot.notebook_name ?? nb?.name ?? "Caderno"),
    materialHints,
  })

  const structured = {
    ...result.structured,
    behavioral_audit: auditResult.audit,
    per_question_errors: perQuestionErrors,
  }

  return {
    structured,
    summaryMd: result.summaryMd,
    snapshot: snapshot as Record<string, unknown>,
    modelUsed: auditResult.usedLlm
      ? `${result.modelUsed}+audit:${auditResult.modelUsed}`
      : result.modelUsed,
    tokensIn: result.tokensIn + auditResult.tokensIn,
    tokensOut: result.tokensOut + auditResult.tokensOut,
    costUsd: result.costUsd + auditResult.costUsd,
    perQuestionCount: perQuestionErrors.length,
    usedLlm: result.usedLlm || auditResult.usedLlm,
  }
}

export async function regenerateBehavioralAuditOnly(
  reportId: string,
  userId: string
): Promise<{
  structured: import("../coach-types").NotebookReportStructured
  auditModelUsed: string
}> {
  const { data: existing } = await supabaseServer
    .from("subject_notebook_reports")
    .select("id, notebook_id, subject_id, structured")
    .eq("id", reportId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!existing?.notebook_id) throw new Error("Relatório não encontrado")

  const prior = (existing.structured ?? {}) as import("../coach-types").NotebookReportStructured
  const perQuestionErrors = prior.per_question_errors ?? []

  const auditResult = await runBehavioralAuditForNotebook(
    existing.notebook_id,
    userId,
    existing.subject_id,
    { skipLlm: false }
  )

  const merged = mergeBehavioralAuditIntoErrors(
    perQuestionErrors,
    auditResult.audit,
    auditResult.payload
  )

  const structured: import("../coach-types").NotebookReportStructured = {
    ...prior,
    behavioral_audit: auditResult.audit,
    per_question_errors: merged,
  }

  await supabaseServer
    .from("subject_notebook_reports")
    .update({ structured })
    .eq("id", reportId)

  if (existing.subject_id) {
    const { enqueueJob } = await import("./jobs/queue")
    await enqueueJob({
      userId,
      jobType: "brain_ingest_report",
      idempotencyKey: `brain:audit:${reportId}:${Date.now()}`,
      payload: {
        subject_id: existing.subject_id,
        report_id: reportId,
      },
      priority: 8,
    })
  }

  return { structured, auditModelUsed: auditResult.modelUsed }
}

export async function enqueueNotebookReport(
  notebookId: string,
  userId: string,
  options?: { force?: boolean }
) {
  const { data: existing } = await supabaseServer
    .from("subject_notebook_reports")
    .select("id")
    .eq("notebook_id", notebookId)
    .maybeSingle()

  if (existing && !options?.force) {
    return { skipped: true, reason: "already_exists", report_id: existing.id }
  }

  const { data: nb } = await supabaseServer
    .from("notebooks")
    .select("subject_id, completed_at")
    .eq("id", notebookId)
    .single()

  if (!nb?.completed_at) return { skipped: true, reason: "not_completed" }

  const { enqueueNotebookPipeline } = await import("./jobs/queue")
  await enqueueNotebookPipeline(userId, notebookId, nb.subject_id, {
    force: options?.force,
  })

  return { skipped: false, queued: true }
}
