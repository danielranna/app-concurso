import type {
  ExecutableAction,
  LearningSignal,
  NotebookReportStructured,
  PerQuestionError,
} from "../coach-types"
import { supabaseServer } from "../supabase-server"

const SIGNAL_LABELS: Record<string, string> = {
  high_recurrence: "Alta reincidência de erros",
  consolidated: "Conteúdo consolidado",
  false_positive_pattern: "Padrão de falso positivo",
  slow_struggle: "Lentidão com insegurança",
  fast_guess_wrong: "Chute rápido errado",
  time_improving: "Tempo melhorando",
}

export async function countReportLlmRunsToday(userId: string): Promise<number> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const { count } = await supabaseServer
    .from("ai_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("agent_type", "report")
    .gte("created_at", start.toISOString())
  return count ?? 0
}

export function buildDeterministicTimeInsights(
  byTopic: { topic: string; wrong: number; correct: number; avg_duration_ms?: number }[]
): NotebookReportStructured["time_insights"] {
  const withDuration = byTopic.filter((t) => (t.avg_duration_ms ?? 0) > 0)
  if (withDuration.length < 2) return []

  const globalMedian = median(
    withDuration.map((t) => t.avg_duration_ms ?? 0)
  )
  const insights: NotebookReportStructured["time_insights"] = []

  for (const t of withDuration) {
    const avg = t.avg_duration_ms ?? 0
    if (avg > globalMedian * 1.35 && t.wrong > 0) {
      insights.push({
        topic: t.topic,
        pattern: "tempo_acima_da_mediana",
        evidence: `Média ${Math.round(avg / 1000)}s vs mediana do caderno ${Math.round(globalMedian / 1000)}s com ${t.wrong} erros.`,
      })
    } else if (avg < globalMedian * 0.65 && t.wrong > 0) {
      insights.push({
        topic: t.topic,
        pattern: "erro_rapido",
        evidence: `Média ${Math.round(avg / 1000)}s com erros — possível chute ou desatenção.`,
      })
    }
  }

  return insights.slice(0, 5)
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function buildDeterministicMetacognition(
  snapshot: Record<string, unknown>,
  signals: LearningSignal[]
): NotebookReportStructured["metacognition_patterns"] {
  const fromOutcome = (
    (snapshot.outcome_breakdown as { outcome: string; count: number }[]) ?? []
  )
    .filter((o) => o.count > 0)
    .map((o) => ({
      pattern: o.outcome,
      count: o.count,
      advice: adviceForOutcome(o.outcome),
    }))

  const fromSignals = signals.slice(0, 5).map((s) => ({
    pattern: SIGNAL_LABELS[s.signal_type] ?? s.signal_type,
    count: Math.max(1, Math.round(s.score / 5)),
    advice: adviceForSignal(s.signal_type),
  }))

  const merged = [...fromSignals, ...fromOutcome]
  const seen = new Set<string>()
  return merged.filter((m) => {
    if (seen.has(m.pattern)) return false
    seen.add(m.pattern)
    return true
  }).slice(0, 8)
}

function adviceForOutcome(outcome: string): string {
  const map: Record<string, string> = {
    lacuna_consciente: "Estude o tópico antes de novas questões.",
    conteudo_desconhecido: "Leia material base e faça flashcards.",
    falso_positivo: "Revise por que marcou certo com dúvida.",
    conhecimento_solido: "Mantenha revisão espaçada.",
    chute: "Responda só quando tiver critério mínimo.",
  }
  return map[outcome] ?? "Revise com caderno de reforço ou mapa de erros."
}

function adviceForSignal(type: string): string {
  const map: Record<string, string> = {
    slow_struggle: "Separe teoria e prática; não acumule questões difíceis.",
    fast_guess_wrong: "Leia o enunciado inteiro; evite chute sob pressão.",
    high_recurrence: "Priorize este tópico na fila estratégica.",
    false_positive_pattern: "Confirme domínio com questões novas, não só sensação.",
  }
  return map[type] ?? "Ajuste o plano de estudo para este padrão."
}

export function buildRuleBasedExecutableActions(
  snapshot: Record<string, unknown>,
  perQuestion: PerQuestionError[],
  subjectId: string | null
): ExecutableAction[] {
  const notebookId = snapshot.notebook_id as string
  const byTopic = (snapshot.by_topic as { topic: string; wrong: number }[]) ?? []
  const weak = [...byTopic].sort((a, b) => b.wrong - a.wrong).filter((t) => t.wrong > 0)
  const actions: ExecutableAction[] = []

  if (subjectId && weak[0]) {
    actions.push({
      type: "review_errors",
      label: `Revisar erros classificados — ${weak[0].topic}`,
      params: {
        subject_id: subjectId,
        topic_key: weak[0].topic,
        href: `/coach/materias/${subjectId}/insights?topic=${encodeURIComponent(weak[0].topic)}`,
      },
      priority: 1,
      estimated_minutes: 20,
    })
    actions.push({
      type: "review_flashcards",
      label: "Revisar flashcards da matéria",
      params: {
        subject_id: subjectId,
        href: `/flashcards/study?subject_id=${subjectId}`,
      },
      priority: 2,
      estimated_minutes: 15,
    })
    actions.push({
      type: "start_combined_study",
      label: "Ver plano de hoje",
      params: { href: "/coach/hoje" },
      priority: 3,
      estimated_minutes: 5,
    })
  }

  const topTax = perQuestion
    .filter((p) => p.tec_topic)
    .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))[0]

  if (subjectId && topTax?.tec_topic && !actions.some((a) => a.type === "read_material")) {
    actions.push({
      type: "read_material",
      label: `Material — ${topTax.tec_topic}`,
      params: {
        subject_id: subjectId,
        topic_key: topTax.tec_topic,
        href: `/coach/materias/${subjectId}/insights`,
      },
      priority: 4,
      estimated_minutes: 15,
    })
  }

  return actions.slice(0, 5)
}

export function mergeStructuredReport(
  base: NotebookReportStructured,
  llm: Partial<NotebookReportStructured> | null
): NotebookReportStructured {
  if (!llm) return base

  return {
    headline: llm.headline?.trim() || base.headline,
    strengths: llm.strengths?.length ? llm.strengths : base.strengths,
    weaknesses: llm.weaknesses?.length ? llm.weaknesses : base.weaknesses,
    time_insights: llm.time_insights?.length ? llm.time_insights : base.time_insights,
    metacognition_patterns: llm.metacognition_patterns?.length
      ? llm.metacognition_patterns
      : base.metacognition_patterns,
    recurring_failures: llm.recurring_failures?.length
      ? llm.recurring_failures
      : base.recurring_failures,
    consolidated_topics: llm.consolidated_topics?.length
      ? llm.consolidated_topics
      : base.consolidated_topics,
    actions_next_7_days: llm.actions_next_7_days?.length
      ? llm.actions_next_7_days
      : base.actions_next_7_days,
    executable_actions: mergeExecutableActions(
      base.executable_actions,
      llm.executable_actions
    ),
    per_question_errors: base.per_question_errors?.length
      ? base.per_question_errors
      : llm.per_question_errors,
    behavioral_audit: base.behavioral_audit ?? llm.behavioral_audit,
    confidence_in_analysis: llm.confidence_in_analysis ?? base.confidence_in_analysis,
  }
}

function mergeExecutableActions(
  base: ExecutableAction[],
  llm?: ExecutableAction[]
): ExecutableAction[] {
  if (!llm?.length) return base
  const byType = new Map(base.map((a) => [a.type, a]))
  for (const a of llm) {
    if (!a.type || !a.label) continue
    if (!byType.has(a.type)) byType.set(a.type, a)
  }
  return [...byType.values()].sort(
    (a, b) => (a.priority ?? 99) - (b.priority ?? 99)
  )
}

export function parsePartialStructured(
  text: string
): Partial<NotebookReportStructured> | null {
  try {
    return JSON.parse(text) as Partial<NotebookReportStructured>
  } catch {
    return null
  }
}

export function structuredReportToMarkdown(
  structured: NotebookReportStructured,
  notebookName: string
): string {
  const lines: string[] = [
    `## ${notebookName}`,
    "",
    structured.headline,
    "",
  ]

  if (structured.strengths.length) {
    lines.push("### Pontos fortes", "")
    for (const s of structured.strengths) {
      lines.push(`- **${s.topic}**: ${s.evidence}`)
    }
    lines.push("")
  }

  if (structured.weaknesses.length) {
    lines.push("### Pontos fracos", "")
    for (const w of structured.weaknesses) {
      lines.push(`- **${w.topic}** (${w.severity}): ${w.evidence}`)
    }
    lines.push("")
  }

  if (structured.time_insights.length) {
    lines.push("### Tempo", "")
    for (const t of structured.time_insights) {
      lines.push(`- ${t.topic}: ${t.evidence}`)
    }
    lines.push("")
  }

  if (structured.actions_next_7_days.length) {
    lines.push("### Plano (7 dias)", "")
    for (const a of structured.actions_next_7_days) {
      lines.push(
        `1. ${a.action}${a.minutes_estimate ? ` (~${a.minutes_estimate} min)` : ""}`
      )
    }
  }

  return lines.join("\n").trim()
}

export type ReportLlmPayload = {
  summary_short?: string
} & Partial<NotebookReportStructured>

export function extractSummaryShort(
  parsed: ReportLlmPayload | Partial<NotebookReportStructured>
): string {
  const p = parsed as ReportLlmPayload
  return p.summary_short?.trim() ?? ""
}
