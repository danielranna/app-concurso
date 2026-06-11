import type { LearningSignal, LearningSignalType } from "../coach-types"
import { topicBrainKey, findTopicEntry } from "./brain-helpers"
import { supabaseServer } from "../supabase-server"

export type StrategicQueueRow = {
  user_id: string
  subject_id: string
  topic_key: string
  topic_label: string
  priority_score: number
  incidence_weight: number
  edital_weight: number
  gap_score: number
  retention_penalty: number
  reason: string
  source: string
  computed_at: string
  recent_boost?: boolean
  priority_source?: "crossed" | "brain"
}

const SIGNAL_BOOST: Partial<Record<LearningSignalType, number>> = {
  high_recurrence: 0.12,
  slow_struggle: 0.1,
  fast_guess_wrong: 0.15,
  false_positive_pattern: 0.08,
  consolidated: -0.05,
  time_improving: -0.03,
}

export function displayTopicFromKey(
  topicKey: string,
  labelByNorm?: Map<string, string>
): string {
  return labelByNorm?.get(topicKey) ?? topicKey
}

export function applyLearningSignalsToScore(
  baseScore: number,
  topicNormKey: string,
  signals: LearningSignal[]
): number {
  let score = baseScore
  for (const sig of signals) {
    const topic =
      sig.entity_type === "tec_topic"
        ? topicBrainKey(sig.entity_id)
        : sig.metadata?.tec_topic
          ? topicBrainKey(String(sig.metadata.tec_topic))
          : null
    if (!topic || topic !== topicNormKey) continue
    const boost = SIGNAL_BOOST[sig.signal_type] ?? 0
    if (boost === 0) continue
    const factor = 1 + boost * Math.min(1, sig.score / 30)
    score = Math.round(score * factor * 1000) / 1000
  }
  return score
}

export function formatHumanPriorityReason(params: {
  editalWeight: number
  incidenceWeight: number
  gapScore: number
  retentionPenalty: number
  wrongCount: number
  recentBoost?: boolean
  topicLabel?: string
}): string {
  const parts: string[] = []
  if (params.recentBoost) parts.push("erros recentes no último caderno")
  if (params.incidenceWeight >= 1.3) parts.push("alta incidência na prova")
  else if (params.incidenceWeight > 1) parts.push("incidência relevante no edital")
  if (params.gapScore >= 0.55) parts.push("lacuna de domínio")
  if (params.retentionPenalty >= 1.2) parts.push("retenção frágil")
  if (params.wrongCount >= 3) parts.push(`${params.wrongCount} erros registrados`)
  if (params.editalWeight >= 1.2) parts.push("matéria prioritária no edital")

  const label = params.topicLabel ?? "Este tópico"
  if (parts.length === 0) {
    return `${label}: manter na rotina de estudo.`
  }
  return `${label}: ${parts.join("; ")}.`
}

export function mergeReasonWithLlm(
  sqlReason: string,
  humanReason: string,
  llmWhy?: string
): string {
  if (llmWhy?.trim()) return llmWhy.trim()
  return humanReason || sqlReason
}

export type StrategyNarrativeLlm = {
  narrative?: string
  items?: { topic_key: string; why: string }[]
}

export function resolveLlmWhyForRow(
  whys: Record<string, string>,
  topicKey: string,
  topicLabel: string
): string | undefined {
  if (whys[topicKey]) return whys[topicKey]
  if (whys[topicLabel]) return whys[topicLabel]
  const key = topicBrainKey(topicLabel)
  if (whys[key]) return whys[key]
  for (const [k, v] of Object.entries(whys)) {
    if (topicBrainKey(k) === topicKey) return v
  }
  return undefined
}

export async function countStrategyLlmRunsToday(userId: string): Promise<number> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const { count } = await supabaseServer
    .from("ai_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("agent_type", "strategy")
    .gte("created_at", start.toISOString())
  return count ?? 0
}

export const DEFAULT_STRATEGY_LLM_DAILY_CAP = 8

export async function shouldUseStrategyLlm(
  userId: string,
  cap = DEFAULT_STRATEGY_LLM_DAILY_CAP
): Promise<boolean> {
  const used = await countStrategyLlmRunsToday(userId)
  return used < cap
}

export function computeSubjectPriorityAggregate(
  rows: { priority_score: number }[]
): number {
  if (!rows.length) return 0
  const sorted = [...rows].sort((a, b) => b.priority_score - a.priority_score)
  const top = sorted.slice(0, 3)
  const avg = top.reduce((s, r) => s + r.priority_score, 0) / top.length
  return Math.round(avg * 1000) / 1000
}

export function buildSubjectPriorityMap(
  queue: { subject_id: string; priority_score: number }[]
): Record<string, number> {
  const bySubject = new Map<string, number[]>()
  for (const item of queue) {
    const list = bySubject.get(item.subject_id) ?? []
    list.push(item.priority_score)
    bySubject.set(item.subject_id, list)
  }
  const out: Record<string, number> = {}
  for (const [sid, scores] of bySubject) {
    out[sid] = computeSubjectPriorityAggregate(
      scores.map((priority_score) => ({ priority_score }))
    )
  }
  return out
}

export function findBrainEntryForTopic(
  brain: { topic_map?: Record<string, { dominio: number; estabilidade: number }> } | null,
  topicDisplay: string,
  topicNorm: string
) {
  if (!brain?.topic_map) return null
  const found = findTopicEntry(brain.topic_map as Parameters<typeof findTopicEntry>[0], topicDisplay)
  if (found) return found[1]
  return brain.topic_map[topicNorm] ?? null
}

export function formatQueueNarrativeSummary(
  items: { topic_label: string; priority_score: number; reason?: string | null }[],
  subjectName?: string
): string {
  if (!items.length) {
    return `Nenhum tópico prioritário para ${subjectName ?? "esta matéria"}.`
  }
  const top = items.slice(0, 3)
  const lines = top.map((t, i) => {
    const tail = t.reason ? ` — ${t.reason}` : ""
    return `${i + 1}. ${t.topic_label} (prioridade ${t.priority_score.toFixed(2)})${tail}`
  })
  return `Fila estratégica${subjectName ? ` — ${subjectName}` : ""}:\n${lines.join("\n")}`
}

export function buildExecutableActionsFromQueue(
  items: { topic_label: string; topic_key: string; reason?: string | null }[],
  subjectId: string
): {
  type: string
  label: string
  params: Record<string, unknown>
  priority?: number
  estimated_minutes?: number
}[] {
  const top = items[0]
  if (!top) return []
  const reason = String(top.reason ?? "").toLowerCase()
  const diagnosticState = reason.includes("diag=unknown")
    ? "unknown"
    : reason.includes("diag=developing")
      ? "developing"
      : "validated"
  const hasCoverage = !reason.includes("cob=nao")
  const minWrongAttempts = diagnosticState === "unknown" ? 0 : 1
  const notebookLabelPrefix =
    diagnosticState === "unknown" ? "Caderno diagnóstico" : "Caderno de reforço"
  const actions: {
    type: string
    label: string
    params: Record<string, unknown>
    priority?: number
    estimated_minutes?: number
  }[] = [
    {
      type: "create_remediation_notebook",
      label: `${notebookLabelPrefix} — ${top.topic_label}`,
      params: {
        subject_id: subjectId,
        tec_topics: [top.topic_label],
        topic_key: top.topic_key,
        min_wrong_attempts: minWrongAttempts,
        suggested_name:
          diagnosticState === "unknown"
            ? `Diagnóstico - ${top.topic_label}`
            : `Reforço - ${top.topic_label}`,
        diagnostic_state: diagnosticState,
        has_coverage: hasCoverage,
      },
      priority: 1,
      estimated_minutes: 45,
    },
    {
      type: "review_errors",
      label: `Revisar erros — ${top.topic_label}`,
      params: {
        subject_id: subjectId,
        topic_key: top.topic_key,
        href: `/coach/materias/${subjectId}/insights?topic=${encodeURIComponent(top.topic_label)}`,
      },
      priority: 2,
      estimated_minutes: 20,
    },
    {
      type: "review_flashcards",
      label: "Flashcards da matéria",
      params: {
        subject_id: subjectId,
        href: `/flashcards/study?subject_id=${subjectId}`,
      },
      priority: 3,
      estimated_minutes: 15,
    },
    {
      type: "start_combined_study",
      label: "Ver plano de hoje",
      params: { href: "/coach/hoje" },
      priority: 4,
      estimated_minutes: 5,
    },
  ]
  return actions
}
