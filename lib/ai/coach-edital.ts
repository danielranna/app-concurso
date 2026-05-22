import { supabaseServer } from "../supabase-server"
import {
  buildIncidencePayloadForExam,
  documentTextExcerpt,
  listCoachDocuments,
} from "../coach-documents"
import { computeLearningSignals, getTopicStatsForSubject } from "../learning-signals"
import { aiComplete } from "./client"
import { getUserAiCredentials } from "./user-credentials"
import {
  asExamPlanStructured,
  buildCoachEditalSummaryMd,
  parseCoachEditalJson,
} from "../coach-edital-format"

const SYSTEM = `Você é coach de concursos. Cruza edital (pesos), incidência histórica por matéria e desempenho do aluno.
Priorize ROI: peso do edital × incidência × gap do aluno. Use APENAS os dados JSON e trechos de PDF fornecidos.
Responda JSON válido:
{
  "headline": "",
  "subject_priority_rank": [{"subject_name":"","priority":1,"why":""}],
  "topic_matrix": [{"subject":"","topic":"","edital_weight_hint":"","incidence_hint":"","your_gap":"","action":""}],
  "weekly_plan": [{"day":"seg","focus":"","minutes":60,"resource":"questoes|flashcards|erros"}],
  "executable_actions": [{"type":"notebook_create|review_flashcards|review_errors","label":"","params":{},"priority":1,"estimated_minutes":45}],
  "risks_if_ignored": [],
  "exam_readiness_score": 0
}`

export async function buildPerformanceSnapshot(userId: string) {
  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)

  const perSubject = []
  for (const s of subjects ?? []) {
    const signals = await computeLearningSignals(userId, s.id)
    const topicStats = await getTopicStatsForSubject(userId, s.id)
    const { count: reportCount } = await supabaseServer
      .from("subject_notebook_reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("subject_id", s.id)

    perSubject.push({
      subject_id: s.id,
      subject_name: s.name,
      top_signals: signals.slice(0, 5),
      weak_topics: topicStats.sort((a, b) => b.wrong - a.wrong).slice(0, 5),
      notebook_reports: reportCount ?? 0,
    })
  }

  return perSubject
}

export async function generateCoachEditalPlan(
  userId: string,
  examTargetId: string
) {
  const credentials = await getUserAiCredentials(userId)
  if (!credentials) {
    throw new Error(
      "Configure sua chave de IA em Coach → Configurações (ou variável de ambiente)."
    )
  }

  const { data: exam, error: exErr } = await supabaseServer
    .from("exam_targets")
    .select("*")
    .eq("id", examTargetId)
    .eq("user_id", userId)
    .single()

  if (exErr || !exam) throw new Error("Prova alvo não encontrada")

  const docs = await listCoachDocuments(userId, { examTargetId })
  const editalDoc = docs.find((d) => d.doc_type === "edital")
  const incidencePayload = await buildIncidencePayloadForExam(
    userId,
    examTargetId
  )

  const editalText = editalDoc ? documentTextExcerpt(editalDoc).slice(0, 25_000) : ""
  const incidenceBySubject =
    incidencePayload.for_llm.length > 0
      ? incidencePayload.for_llm
      : docs
          .filter((d) => d.doc_type === "incidence" && d.subject_id)
          .map((d) => {
            const pt = (d.parsed_tables ?? {}) as Record<string, unknown>
            return {
              subject_id: d.subject_id,
              subject_name: null,
              excel_label: pt.matched_subject_label ?? d.title,
              top_topics:
                (pt.groups as {
                  name: string
                  percent: number
                  quantity: number
                }[]) ?? [],
            }
          })

  const performance = await buildPerformanceSnapshot(userId)

  const { data: recentReports } = await supabaseServer
    .from("subject_notebook_reports")
    .select("structured, subject_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(8)

  const input = {
    exam_target: exam,
    edital_excerpt: editalText || null,
    incidence_workbook: incidencePayload.workbook
      ? {
          title: incidencePayload.workbook.title,
          block_count: incidencePayload.blocks.length,
          mapped_subjects: incidencePayload.mapping.by_subject.length,
          unmapped_subjects: incidencePayload.mapping.unmapped_subjects.map(
            (s) => s.name
          ),
        }
      : null,
    incidence_by_subject: incidenceBySubject,
    performance_snapshot: performance,
    recent_notebook_summaries: (recentReports ?? []).map((r) => ({
      subject_id: r.subject_id,
      headline: (r.structured as { headline?: string })?.headline,
    })),
  }

  const result = await aiComplete(
    {
      jsonMode: true,
      maxTokens: 3500,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(input) },
      ],
    },
    credentials
  )

  const structuredRaw = parseCoachEditalJson(result.text || "{}")
  const structured = asExamPlanStructured(structuredRaw)

  const summaryMd = buildCoachEditalSummaryMd(exam.name, structured)

  const { data: report, error: repErr } = await supabaseServer
    .from("exam_target_reports")
    .insert({
      exam_target_id: examTargetId,
      user_id: userId,
      summary_md: summaryMd,
      structured,
      input_snapshot: input,
      model_used: result.model,
    })
    .select("id")
    .single()

  if (repErr) throw new Error(repErr.message)

  for (const action of (structured.executable_actions as {
    type?: string
    label?: string
    params?: Record<string, unknown>
  }[]) ?? []) {
    if (!action?.label) continue
    const t = action.type === "notebook_create" ? "notebook_create" : "question_pick"
    await supabaseServer.from("ai_action_drafts").insert({
      user_id: userId,
      type: t,
      label: action.label,
      payload: action.params ?? {},
      exam_target_id: examTargetId,
      source_agent: "coach_edital",
      status: "pending",
    })
  }

  await supabaseServer.from("ai_runs").insert({
    user_id: userId,
    agent_type: "coach_edital",
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
    cost_estimate: result.costUsdEstimate,
    status: "ok",
    metadata: { exam_target_id: examTargetId, report_id: report?.id },
  })

  return { report_id: report?.id, structured, summary_md: summaryMd }
}
