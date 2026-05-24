import { supabaseServer } from "../supabase-server"
import { computeLearningSignals } from "../learning-signals"
import type { ExecutableAction } from "../coach-types"
import { aiComplete } from "./client"
import { getUserAiCredentials } from "./user-credentials"
import { recomputeStrategicQueue } from "./strategic-queue"

const SYSTEM = `Você complementa a fila estratégica já calculada. Use os dados JSON.
Responda:
{
  "top_priorities": [{"rank":1,"title":"","why":"","domain":"questoes|flashcards|erros","time_minutes":45}],
  "executable_actions": [{"type":"create_remediation_notebook|review_flashcards|review_errors|notebook_create","label":"","params":{},"priority":1,"estimated_minutes":45}],
  "narrative_summary": ""
}`

export async function generatePriorityVerdict(
  userId: string,
  subjectId: string
) {
  await recomputeStrategicQueue(userId, subjectId, { withLlmNarrative: false })

  const { data: queue } = await supabaseServer
    .from("strategic_queue_items")
    .select("*")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .order("priority_score", { ascending: false })
    .limit(15)

  const credentials = await getUserAiCredentials(userId)

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

  const { data: openErrors } = await supabaseServer
    .from("errors")
    .select("id, error_text, review_count, topics!inner(name, subject_id)")
    .eq("user_id", userId)
    .eq("topics.subject_id", subjectId)
    .order("review_count", { ascending: false })
    .limit(15)

  const { count: dueCards } = await supabaseServer
    .from("flashcard_states")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("due_at", new Date().toISOString())

  const input = {
    subject_name: subject?.name,
    strategic_queue: queue ?? [],
    subject_brain: brain?.state ?? null,
    learning_signals: signals.slice(0, 10),
    open_errors_count: openErrors?.length ?? 0,
    flashcards_due_estimate: dueCards ?? 0,
  }

  let structured: Record<string, unknown> = {
    top_priorities: (queue ?? []).slice(0, 5).map((q, i) => ({
      rank: i + 1,
      title: q.topic_key,
      why: q.reason ?? `Score ${q.priority_score}`,
      domain: "questoes",
      time_minutes: 40,
    })),
    narrative_summary:
      brain?.summary_md?.slice(0, 300) ||
      `Fila estratégica com ${queue?.length ?? 0} tópicos para ${subject?.name ?? "matéria"}.`,
    executable_actions: [] as ExecutableAction[],
  }

  let tokensIn = 0
  let tokensOut = 0

  if (credentials && (queue?.length ?? 0) > 0) {
    try {
      const result = await aiComplete(
        {
          jsonMode: true,
          maxTokens: 2000,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: JSON.stringify(input) },
          ],
        },
        credentials
      )
      structured = { ...structured, ...JSON.parse(result.text || "{}") }
      tokensIn = result.tokensIn
      tokensOut = result.tokensOut
    } catch {
      /* keep queue-based */
    }
  }

  await supabaseServer.from("ai_runs").insert({
    user_id: userId,
    agent_type: "priority_verdict",
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    status: "ok",
    metadata: { subject_id: subjectId, queue_size: queue?.length ?? 0 },
  })

  return { structured, input, queue: queue ?? [] }
}
