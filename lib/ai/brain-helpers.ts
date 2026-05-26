import type {
  ErrorTaxonomy,
  LearningSignal,
  NotebookReportStructured,
  SubjectBrainState,
  TopicBrainEntry,
} from "../coach-types"
import { normLabel } from "../incidence-subject-map"

export function topicBrainKey(displayTopic: string): string {
  const trimmed = displayTopic.trim() || "Sem tópico"
  return normLabel(trimmed) || trimmed
}

export function findTopicEntry(
  topicMap: Record<string, TopicBrainEntry>,
  displayOrKey: string
): [string, TopicBrainEntry] | null {
  const key = topicBrainKey(displayOrKey)
  if (topicMap[key]) return [key, topicMap[key]!]
  const found = Object.entries(topicMap).find(
    ([k]) => normLabel(k) === key || normLabel(k) === normLabel(displayOrKey)
  )
  return found ?? null
}

export function mergeReportIntoBrain(params: {
  topic_map: Record<string, TopicBrainEntry>
  danger_topics: string[]
  structured: NotebookReportStructured | null | undefined
}): boolean {
  const s = params.structured
  if (!s) return false

  let merged = false

  for (const w of s.weaknesses ?? []) {
    const key = topicBrainKey(w.topic)
    const entry = params.topic_map[key]
    if (entry) {
      entry.dominio = Math.round(Math.min(0.45, entry.dominio * 0.85) * 100) / 100
      if (w.severity === "alta") entry.status = "critico"
      else if (entry.status !== "critico") entry.status = "fraco"
      merged = true
    } else {
      params.topic_map[key] = {
        label: w.topic,
        status: w.severity === "alta" ? "critico" : "fraco",
        dominio: 0.35,
        estabilidade: 0.35,
        retencao: 0.35,
      }
      merged = true
    }
    if (!params.danger_topics.includes(key)) params.danger_topics.push(key)
  }

  for (const eq of s.per_question_errors ?? []) {
    const topic = eq.tec_topic?.trim()
    if (!topic) continue
    const key = topicBrainKey(topic)
    if (!params.danger_topics.includes(key)) params.danger_topics.push(key)
    const entry = params.topic_map[key]
    if (entry && eq.error_taxonomy) {
      entry.predominant_error = eq.error_taxonomy
      if ((eq.priority_score ?? 0) > 50) entry.status = "critico"
      merged = true
    }
    const insight = eq.misconception ?? eq.specific_mistake ?? eq.feedback_detailed
    if (entry && insight) {
      entry.last_insight = insight.slice(0, 280)
      merged = true
    } else if (!entry && insight) {
      params.topic_map[key] = {
        label: topic,
        status: "fraco",
        dominio: 0.4,
        estabilidade: 0.35,
        retencao: 0.35,
        predominant_error: eq.error_taxonomy,
        last_insight: insight.slice(0, 280),
      }
      merged = true
    }
  }

  return merged
}

export function applyLearningSignalsToBrain(params: {
  topic_map: Record<string, TopicBrainEntry>
  danger_topics: string[]
  signals: LearningSignal[]
}): void {
  for (const sig of params.signals.slice(0, 15)) {
    const topic =
      sig.entity_type === "tec_topic"
        ? sig.entity_id
        : (sig.metadata?.tec_topic as string | undefined)
    if (!topic) continue

    const key = topicBrainKey(topic)
    let entry = params.topic_map[key]

    if (!entry) {
      entry = {
        label: topic,
        status: "em_evolucao",
        dominio: 0.5,
        estabilidade: 0.4,
        retencao: 0.45,
      }
      params.topic_map[key] = entry
    }

    if (
      sig.signal_type === "high_recurrence" ||
      sig.signal_type === "slow_struggle" ||
      sig.signal_type === "fast_guess_wrong"
    ) {
      if (!params.danger_topics.includes(key)) params.danger_topics.push(key)
      if (sig.signal_type === "fast_guess_wrong" && entry.dominio >= 0.55) {
        entry.status = "ilusao_dominio"
      } else if (sig.score >= 20 && entry.status !== "critico") {
        entry.status = "fraco"
      }
    }

    if (sig.signal_type === "false_positive_pattern" && entry.dominio >= 0.6) {
      entry.status = "ilusao_dominio"
      if (!params.danger_topics.includes(key)) params.danger_topics.push(key)
    }

    if (sig.signal_type === "consolidated" && entry.dominio >= 0.7) {
      entry.status = "forte"
      params.danger_topics = params.danger_topics.filter((d) => d !== key)
    }
  }
}

export function computeDominioDelta(
  previous: SubjectBrainState | null | undefined,
  current: Record<string, TopicBrainEntry>
): Record<string, number> {
  const delta: Record<string, number> = {}
  if (!previous?.topic_map) return delta

  for (const [key, entry] of Object.entries(current)) {
    const prev =
      previous.topic_map[key] ??
      Object.entries(previous.topic_map).find(
        ([k]) => normLabel(k) === normLabel(key)
      )?.[1]
    if (prev) {
      const d = Math.round((entry.dominio - prev.dominio) * 100) / 100
      if (Math.abs(d) >= 0.05) delta[key] = d
    }
  }
  return delta
}

export function buildRuleBasedBrainSummary(
  state: SubjectBrainState,
  subjectName?: string
): string {
  const lines: string[] = []
  const title = subjectName ? `**${subjectName}**` : "Matéria"
  lines.push(`${title} — tendência **${state.trend}**.`, "")

  if (state.danger_topics.length) {
    lines.push(
      `Tópicos de alerta: ${state.danger_topics
        .slice(0, 5)
        .map((k) => state.topic_map[k]?.label ?? k)
        .join(", ")}.`
    )
  }

  const weak = Object.entries(state.topic_map)
    .sort((a, b) => a[1].dominio - b[1].dominio)
    .slice(0, 3)
  if (weak.length) {
    lines.push("")
    lines.push("Maiores lacunas:")
    for (const [key, e] of weak) {
      lines.push(
        `- ${e.label ?? key}: domínio ${Math.round(e.dominio * 100)}%, status ${e.status}`
      )
    }
  }

  return lines.join("\n").trim()
}

export type BrainNarrativeLlm = {
  summary_md?: string
  danger_topics_add?: string[]
  trend?: string
}

export function mergeBrainNarrative(
  state: SubjectBrainState,
  llm: BrainNarrativeLlm | null,
  subjectName?: string
): { state: SubjectBrainState; summaryMd: string } {
  const dangerSet = new Set(state.danger_topics)
  for (const t of llm?.danger_topics_add ?? []) {
    if (t?.trim()) dangerSet.add(topicBrainKey(t))
  }

  const validTrends = ["melhorando", "piorando", "estagnado", "desconhecido"] as const
  const trend =
    llm?.trend && validTrends.includes(llm.trend as (typeof validTrends)[number])
      ? (llm.trend as SubjectBrainState["trend"])
      : state.trend

  const mergedState: SubjectBrainState = {
    ...state,
    danger_topics: [...dangerSet].slice(0, 12),
    trend,
  }

  const summaryMd =
    llm?.summary_md?.trim() || buildRuleBasedBrainSummary(mergedState, subjectName)

  return { state: mergedState, summaryMd }
}

export function applyPredominantErrors(
  errorByTopic: Map<string, Map<string, number>>,
  topicMap: Record<string, TopicBrainEntry>
): void {
  for (const [displayTopic, taxMap] of errorByTopic) {
    const key = topicBrainKey(displayTopic)
    const entry = topicMap[key]
    if (!entry || !taxMap.size) continue
    const top = [...taxMap.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top) entry.predominant_error = top[0] as ErrorTaxonomy
  }
}
