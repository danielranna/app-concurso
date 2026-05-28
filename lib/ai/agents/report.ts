import type { NotebookReportStructured, PerQuestionError } from "../../coach-types"
import { runAgent } from "../run-agent"
import {
  extractSummaryShort,
  mergeStructuredReport,
  parsePartialStructured,
  structuredReportToMarkdown,
  type ReportLlmPayload,
} from "../report-helpers"
const REPORT_JSON_SCHEMA = `Responda JSON com:
{
  "summary_short": "2-4 frases motivacionais",
  "headline": "",
  "strengths": [{"topic":"","evidence":""}],
  "weaknesses": [{"topic":"","evidence":"","severity":"alta|media|baixa"}],
  "time_insights": [{"topic":"","pattern":"","evidence":""}],
  "metacognition_patterns": [{"pattern":"","count":0,"advice":""}],
  "recurring_failures": [{"tec_id":0,"attempts":0,"advice":""}],
  "consolidated_topics": [""],
  "actions_next_7_days": [{"action":"","priority":1,"minutes_estimate":30}],
  "confidence_in_analysis": "alta|media|baixa"
}
NÃO altere executable_actions nem per_question_errors. Use APENAS dados do input.`

const SYSTEM = `Você é o Agente Relatório de Caderno. Analisa desempenho após conclusão de um caderno.
Priorize: (1) tópicos fracos com taxonomia, (2) padrões metacognitivos, (3) tempo por tópico,
(4) reincidência, (5) consolidação e sinais de aprendizado.
Cite tec_topic exatamente como no JSON. Português (BR).
${REPORT_JSON_SCHEMA}`

export type RunReportAgentResult = {
  structured: NotebookReportStructured
  summaryMd: string
  modelUsed: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  usedLlm: boolean
}

export async function runReportAgent(params: {
  userId: string
  subjectId: string | null
  snapshot: Record<string, unknown>
  brain: Record<string, unknown> | null
  perQuestionErrors: PerQuestionError[]
  ruleBased: NotebookReportStructured
  skipLlm?: boolean
  notebookName: string
}): Promise<RunReportAgentResult> {
  const base: NotebookReportStructured = {
    ...params.ruleBased,
    per_question_errors: params.perQuestionErrors,
  }

  if (params.skipLlm) {
    const summaryMd = structuredReportToMarkdown(base, params.notebookName)
    return {
      structured: base,
      summaryMd,
      modelUsed: "rule-based",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      usedLlm: false,
    }
  }

  const input = {
    snapshot: params.snapshot,
    subject_brain: params.brain,
    classified_errors_summary: params.perQuestionErrors.slice(0, 15).map((e) => ({
      topic: e.tec_topic,
      taxonomy: e.error_taxonomy,
      priority: e.priority_score,
      mistake: e.specific_mistake,
      has_explanation: Boolean(e.explanation),
    })),
    learning_signals: params.snapshot.learning_signals,
    incidence_top_topics: params.snapshot.incidence_top_topics,
    prior_report_headline: params.snapshot.prior_report_headline,
  }

  const jsonResult = await runAgent({
    agentType: "report",
    userId: params.userId,
    subjectId: params.subjectId,
    systemPrompt: SYSTEM,
    userContent: `Análise do caderno:\n${JSON.stringify(input)}`,
    jsonMode: true,
    maxTokens: 2200,
    metadata: { notebook_id: params.snapshot.notebook_id, phase: "structured" },
  })

  if (!jsonResult.usedLlm || !jsonResult.text) {
    const summaryMd = structuredReportToMarkdown(base, params.notebookName)
    return {
      structured: base,
      summaryMd,
      modelUsed: "rule-based",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      usedLlm: false,
    }
  }

  const partial = parsePartialStructured(jsonResult.text) as ReportLlmPayload | null
  const merged = mergeStructuredReport(base, partial)
  const summaryShort = partial ? extractSummaryShort(partial) : ""
  const summaryMd =
    summaryShort ||
    structuredReportToMarkdown(merged, params.notebookName)

  return {
    structured: merged,
    summaryMd,
    modelUsed: jsonResult.model,
    tokensIn: jsonResult.tokensIn,
    tokensOut: jsonResult.tokensOut,
    costUsd: jsonResult.costUsd,
    usedLlm: true,
  }
}
