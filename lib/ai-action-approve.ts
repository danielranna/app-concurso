import { supabaseServer } from "./supabase-server"
import { ensureCardState } from "./flashcard-review"
import {
  createNotebookFromQuestionIds,
  pickQuestionIdsFromPerformance,
} from "./notebook-from-performance"

export async function approveAiActionDraft(draftId: string, userId: string) {
  const { data: draft, error } = await supabaseServer
    .from("ai_action_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .single()

  if (error || !draft) throw new Error("Rascunho não encontrado ou já resolvido")

  const payload = draft.payload as Record<string, unknown>
  let result: Record<string, unknown> = {}

  switch (draft.type) {
    case "flashcard_create": {
      const deck_id = payload.deck_id as string
      const type = (payload.type as string) ?? "basic"
      const front_text = payload.front_text as string
      const back_text = payload.back_text as string
      if (!deck_id || !front_text) throw new Error("Payload de flashcard incompleto")

      const { data: card, error: insErr } = await supabaseServer
        .from("flashcards")
        .insert({
          user_id: userId,
          deck_id,
          type,
          front_text,
          back_text: back_text ?? "",
          cloze_text: payload.cloze_text ?? null,
        })
        .select("id")
        .single()

      if (insErr) throw new Error(insErr.message)
      await ensureCardState(userId, card.id)
      result = { flashcard_id: card.id }
      break
    }

    case "error_create": {
      const topic_id = payload.topic_id as string
      const error_text = payload.error_text as string
      const correction_text = payload.correction_text as string
      if (!topic_id || !error_text || !correction_text) {
        throw new Error("Payload de erro incompleto")
      }

      const { error: insErr } = await supabaseServer.from("errors").insert({
        user_id: userId,
        topic_id,
        error_text,
        correction_text,
        description: (payload.description as string) ?? null,
        reference_link: (payload.reference_link as string) ?? null,
        error_type: (payload.error_type as string) ?? null,
        error_status: (payload.error_status as string) ?? null,
      })
      if (insErr) throw new Error(insErr.message)
      result = { ok: true }
      break
    }

    case "notebook_create": {
      const name = (payload.suggested_name as string) ?? draft.label
      const subject_id =
        (payload.subject_id as string) ?? draft.subject_id
      if (!subject_id) throw new Error("subject_id obrigatório para caderno")

      const rules = {
        wrong_only: true,
        min_wrong_attempts: (payload.min_wrong_attempts as number) ?? 1,
        tec_topics: payload.tec_topics as string[] | undefined,
        source_notebook_id: payload.source_notebook_id as string | undefined,
        subject_id,
        limit: (payload.limit as number) ?? 50,
        outcome_categories: payload.outcome_categories as string[] | undefined,
      }

      const questionIds = payload.question_ids as string[] | undefined
      const ids =
        questionIds?.length
          ? questionIds
          : await pickQuestionIdsFromPerformance(userId, rules)

      if (!ids.length) throw new Error("Nenhuma questão encontrada para o caderno")

      const notebook_id = await createNotebookFromQuestionIds(
        userId,
        name,
        subject_id,
        ids
      )
      result = { notebook_id }
      break
    }

    case "question_pick": {
      result = { question_ids: payload.question_ids ?? [] }
      break
    }

    default:
      throw new Error(`Tipo de rascunho não suportado: ${draft.type}`)
  }

  await supabaseServer
    .from("ai_action_drafts")
    .update({
      status: "approved",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", draftId)

  return result
}
