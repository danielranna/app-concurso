import { supabaseServer } from "../supabase-server"
import { computeLearningSignals } from "../learning-signals"
import type { ExecutableAction } from "../coach-types"
import { getExecutorStudyPreferences } from "./execution-subjects"
import { resolvePrioritySource } from "../priority-source"
import {
  buildExecutableActionsFromQueue,
  formatQueueNarrativeSummary,
} from "./strategy-helpers"

/** Ações e narrativa derivadas da fila SQL — sem segundo ranking paralelo. */
export async function generatePriorityVerdict(
  userId: string,
  subjectId: string
) {
  const parseReasonMeta = (reason?: string | null) => {
    const text = String(reason ?? "")
    const low = text.toLowerCase()
    const diag =
      /diag=(unknown|developing|validated)/.exec(low)?.[1] ?? "validated"
    const attempts = Number(/tentativas=(\d+)/.exec(low)?.[1] ?? 0)
    const hasMaterial = !low.includes("cob=nao")
    return { diag, attempts, hasMaterial }
  }

  const prefs = await getExecutorStudyPreferences(userId)
  const prioritySource = resolvePrioritySource(prefs.study_mode)

  const { data: queue } = await supabaseServer
    .from("strategic_queue_items")
    .select("*")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .eq("priority_source", prioritySource)
    .order("priority_score", { ascending: false })
    .limit(15)

  const { data: subject } = await supabaseServer
    .from("subjects")
    .select("name")
    .eq("id", subjectId)
    .single()

  const signals = await computeLearningSignals(userId, subjectId)

  const { data: brain } = await supabaseServer
    .from("subject_brain_state")
    .select("state, summary_md")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .maybeSingle()

  const top = (queue ?? []).slice(0, 8)
  const queueForActions = top.map((q) => ({
    topic_key: q.topic_key,
    topic_label:
      (q as { topic_label?: string }).topic_label ?? q.topic_key,
    priority_score: Number(q.priority_score),
    reason: q.reason,
  }))

  const executable_actions = buildExecutableActionsFromQueue(
    queueForActions,
    subjectId
  ) as ExecutableAction[]

  const structured: Record<string, unknown> = {
    top_priorities: top.map((q, i) => ({
      ...parseReasonMeta(q.reason),
      rank: i + 1,
      title:
        (q as { topic_label?: string }).topic_label ?? q.topic_key,
      why: q.reason ?? `Prioridade ${Number(q.priority_score).toFixed(2)}`,
      domain: "questoes",
      time_minutes: 40,
      topic_key: q.topic_key,
      priority_score: q.priority_score,
      relevance_weight: Number((q as { edital_weight?: number }).edital_weight ?? 1),
      incidence_weight: Number((q as { incidence_weight?: number }).incidence_weight ?? 1),
      gap_score: Number((q as { gap_score?: number }).gap_score ?? 0),
      retention_penalty: Number((q as { retention_penalty?: number }).retention_penalty ?? 1),
      source: q.source ?? "sql",
    })),
    narrative_summary:
      formatQueueNarrativeSummary(queueForActions, subject?.name) ||
      brain?.summary_md?.slice(0, 300) ||
      `Fila estratégica com ${queue?.length ?? 0} tópicos.`,
    executable_actions,
    learning_signals_preview: signals.slice(0, 6),
    source: "strategic_queue",
  }

  return { structured, input: { strategic_queue: queue }, queue: queue ?? [] }
}
