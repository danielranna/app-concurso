import { supabaseServer } from "../supabase-server"
import { computeLearningSignals } from "../learning-signals"
import type { ExecutableAction } from "../coach-types"
import { aiComplete } from "./client"
import { getUserAiCredentials } from "./user-credentials"

const SYSTEM = `Você é o Orquestrador de Prioridades. Unifique questões, flashcards e erros em até 5 prioridades para 7 dias.
Use APENAS os dados JSON. Responda:
{
  "top_priorities": [{"rank":1,"title":"","why":"","domain":"questoes|flashcards|erros","time_minutes":45}],
  "executable_actions": [{"type":"create_remediation_notebook|review_flashcards|review_errors|notebook_create","label":"","params":{},"priority":1,"estimated_minutes":45}],
  "narrative_summary": ""
}`

export async function generatePriorityVerdict(
  userId: string,
  subjectId: string
) {
  const credentials = await getUserAiCredentials(userId)

  const { data: subject } = await supabaseServer
    .from("subjects")
    .select("name")
    .eq("id", subjectId)
    .single()

  const signals = await computeLearningSignals(userId, subjectId)

  const { data: latestReport } = await supabaseServer
    .from("subject_notebook_reports")
    .select("structured, summary_md, created_at")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(1)
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
    learning_signals: signals.slice(0, 15),
    latest_notebook_report: latestReport?.structured ?? null,
    open_errors_count: openErrors?.length ?? 0,
    top_errors: (openErrors ?? []).slice(0, 8).map((e) => {
      const t = e.topics as { name: string } | { name: string }[]
      const name = Array.isArray(t) ? t[0]?.name : t?.name
      return { topic: name, review_count: e.review_count }
    }),
    flashcards_due_estimate: dueCards ?? 0,
  }

  let structured: Record<string, unknown> = {
    top_priorities: signals.slice(0, 5).map((s, i) => ({
      rank: i + 1,
      title: `${s.signal_type} — ${s.entity_id}`,
      why: JSON.stringify(s.metadata),
      domain: "questoes",
      time_minutes: 40,
    })),
    narrative_summary: `Foco em ${subject?.name ?? "matéria"} com base nos sinais SQL.`,
    executable_actions: [] as ExecutableAction[],
  }

  let tokensIn = 0
  let tokensOut = 0

  if (credentials) {
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
      structured = JSON.parse(result.text || "{}")
      tokensIn = result.tokensIn
      tokensOut = result.tokensOut
    } catch {
      /* keep rule-based */
    }
  }

  await supabaseServer.from("ai_runs").insert({
    user_id: userId,
    agent_type: "priority_verdict",
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    status: "ok",
    metadata: { subject_id: subjectId },
  })

  return { structured, input }
}
