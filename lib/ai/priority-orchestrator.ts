import { supabaseServer } from "../supabase-server"
import { computeLearningSignals } from "../learning-signals"
import type { ExecutableAction } from "../coach-types"
import {
  buildExecutableActionsFromQueue,
  formatQueueNarrativeSummary,
} from "./strategy-helpers"

/** Ações e narrativa derivadas da fila SQL — sem segundo ranking paralelo. */
export async function generatePriorityVerdict(
  userId: string,
  subjectId: string
) {
  const { data: queue } = await supabaseServer
    .from("strategic_queue_items")
    .select("*")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
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
      rank: i + 1,
      title:
        (q as { topic_label?: string }).topic_label ?? q.topic_key,
      why: q.reason ?? `Prioridade ${Number(q.priority_score).toFixed(2)}`,
      domain: "questoes",
      time_minutes: 40,
      topic_key: q.topic_key,
      priority_score: q.priority_score,
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
