import { supabaseServer } from "../supabase-server"
import { ensureSubjectDecks } from "../flashcard-subjects"
import { resolveQuestionMapping } from "../tec-mapping"
import type { NotebookReportStructured } from "../coach-types"
import { aiComplete } from "./client"
import { getUserAiCredentials } from "./user-credentials"

const SYSTEM = `Você sugere flashcards e entradas no mapa de erros com base em lacunas reais do aluno.
Use APENAS tópicos e dados fornecidos. Máximo 4 flashcards e 4 erros.
Responda JSON: {
  "flashcards": [{"topic":"", "front_text":"", "back_text":""}],
  "errors": [{"topic":"", "error_text":"", "correction_text":""}]
}
Não invente leis ou artigos específicos; seja genérico no erro/correção quando faltar detalhe.`

export async function generateRemediationDrafts(params: {
  userId: string
  subjectId: string
  notebookId: string
  structured: NotebookReportStructured
  snapshot: Record<string, unknown>
}) {
  const credentials = await getUserAiCredentials(params.userId)
  if (!credentials) return { created: 0 }

  const { subjects } = await ensureSubjectDecks(params.userId)
  const deck = subjects.find((s) => s.subject_id === params.subjectId)
  if (!deck) return { created: 0 }

  const { data: topics } = await supabaseServer
    .from("topics")
    .select("id, name")
    .eq("user_id", params.userId)
    .eq("subject_id", params.subjectId)

  const weaknesses = params.structured.weaknesses?.slice(0, 5) ?? []
  if (!weaknesses.length) return { created: 0 }

  let parsed: {
    flashcards?: { topic: string; front_text: string; back_text: string }[]
    errors?: { topic: string; error_text: string; correction_text: string }[]
  } = {}

  try {
    const result = await aiComplete(
      {
        jsonMode: true,
        maxTokens: 1200,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: JSON.stringify({
              weaknesses,
              topics: (topics ?? []).map((t) => t.name),
              recurring: params.structured.recurring_failures?.slice(0, 5),
            }),
          },
        ],
      },
      credentials
    )
    parsed = JSON.parse(result.text || "{}")
  } catch {
    return { created: 0 }
  }

  let created = 0

  for (const fc of (parsed.flashcards ?? []).slice(0, 4)) {
    if (!fc.front_text?.trim()) continue
    await supabaseServer.from("ai_action_drafts").insert({
      user_id: params.userId,
      subject_id: params.subjectId,
      type: "flashcard_create",
      label: `Flashcard: ${fc.topic || fc.front_text.slice(0, 40)}`,
      payload: {
        deck_id: deck.deck_id,
        type: "basic",
        front_text: fc.front_text.trim(),
        back_text: (fc.back_text ?? "").trim(),
      },
      source_agent: "remediation_drafts",
      status: "pending",
    })
    created++
  }

  for (const err of (parsed.errors ?? []).slice(0, 4)) {
    if (!err.error_text?.trim() || !err.correction_text?.trim()) continue

    let topicId: string | null = null
    const match = (topics ?? []).find(
      (t) => t.name.trim().toLowerCase() === err.topic.trim().toLowerCase()
    )
    if (match) topicId = match.id
    else {
      const { data: mapRow } = await supabaseServer
        .from("tec_taxonomy_mappings")
        .select("tec_subject, topic_id")
        .eq("user_id", params.userId)
        .eq("subject_id", params.subjectId)
        .not("topic_id", "is", null)
        .limit(1)
        .maybeSingle()
      if (mapRow?.tec_subject) {
        const resolved = await resolveQuestionMapping(
          params.userId,
          mapRow.tec_subject,
          err.topic
        )
        topicId = resolved.topic_id
      }
    }

    if (!topicId) continue

    await supabaseServer.from("ai_action_drafts").insert({
      user_id: params.userId,
      subject_id: params.subjectId,
      type: "error_create",
      label: `Erro no mapa: ${err.topic || "lacuna"}`,
      payload: {
        topic_id: topicId,
        error_text: err.error_text.trim(),
        correction_text: err.correction_text.trim(),
        description: `Sugerido após caderno ${params.notebookId}`,
      },
      source_agent: "remediation_drafts",
      status: "pending",
    })
    created++
  }

  if (created > 0) {
    await supabaseServer.from("ai_runs").insert({
      user_id: params.userId,
      agent_type: "remediation_drafts",
      status: "ok",
      metadata: { notebook_id: params.notebookId, drafts: created },
    })
  }

  return { created }
}
