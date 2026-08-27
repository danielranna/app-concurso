import { supabaseServer } from "./supabase-server"
import {
  combineNoteBodies,
  combinePendingNoteBodies,
  splitPendingNoteEntries,
} from "./note-entry-utils"

export { combineNoteBodies, combinePendingNoteBodies, splitPendingNoteEntries }

export type QuestionNoteEntryRow = {
  id: string
  user_id: string
  question_id: string
  body: string
  created_at: string
  ai_processed_at: string | null
  ai_classify: Record<string, unknown> | null
  ai_feedback: string | null
  ai_audit_zone: string | null
  ai_model_used: string | null
}

export type QuestionNoteEntryPublic = {
  id: string
  body: string
  created_at: string
  has_ai_response: boolean
  ai_feedback: string | null
  ai_pending: boolean
}

export function toPublicNoteEntry(row: {
  id: string
  body: string
  created_at: string
  ai_processed_at?: string | null
  ai_feedback?: string | null
}, options?: { expectAi?: boolean }): QuestionNoteEntryPublic {
  const aiFeedback = row.ai_feedback?.trim() || null
  const processed = Boolean(row.ai_processed_at)
  const expectAi = options?.expectAi ?? true
  return {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    has_ai_response: processed && Boolean(aiFeedback),
    ai_feedback: aiFeedback,
    ai_pending: expectAi && !processed,
  }
}

export async function insertQuestionNote(
  userId: string,
  questionId: string,
  body: string,
  options?: { syncOrigin?: "whatsapp" | null }
): Promise<QuestionNoteEntryPublic> {
  const trimmed = body.trim()
  if (!trimmed) throw new Error("Escreva algo antes de enviar")

  const row: Record<string, unknown> = {
    user_id: userId,
    question_id: questionId,
    body: trimmed,
  }
  if (options?.syncOrigin) row.sync_origin = options.syncOrigin

  const { data, error } = await supabaseServer
    .from("question_note_entries")
    .insert(row)
    .select("id, body, created_at, ai_processed_at, ai_feedback")
    .single()

  if (error) throw new Error(error.message)
  return toPublicNoteEntry(data)
}

export async function latestAttemptForQuestion(
  userId: string,
  questionId: string
): Promise<{
  id: string
  notebook_id: string | null
  selected_answer: string
  confidence_level: string | null
  duration_ms: number | null
  error_detail: Record<string, unknown> | null
} | null> {
  const { data, error } = await supabaseServer
    .from("question_attempts")
    .select("id, notebook_id, selected_answer, confidence_level, duration_ms, error_detail")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.id) return null
  return {
    id: data.id as string,
    notebook_id: (data.notebook_id as string | null) ?? null,
    selected_answer: String(data.selected_answer ?? ""),
    confidence_level: (data.confidence_level as string | null) ?? null,
    duration_ms: data.duration_ms == null ? null : Number(data.duration_ms),
    error_detail: (data.error_detail as Record<string, unknown> | null) ?? null,
  }
}

export async function loadNoteEntriesByQuestion(
  userId: string,
  questionIds: string[]
): Promise<Map<string, QuestionNoteEntryRow[]>> {
  const map = new Map<string, QuestionNoteEntryRow[]>()
  if (!questionIds.length) return map

  const { data, error } = await supabaseServer
    .from("question_note_entries")
    .select(
      "id, user_id, question_id, body, created_at, ai_processed_at, ai_classify, ai_feedback, ai_audit_zone, ai_model_used"
    )
    .eq("user_id", userId)
    .in("question_id", questionIds)
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)

  for (const row of (data ?? []) as QuestionNoteEntryRow[]) {
    const list = map.get(row.question_id) ?? []
    list.push(row)
    map.set(row.question_id, list)
  }
  return map
}

export async function clearNoteAiCacheForNotebook(
  notebookId: string,
  userId: string
): Promise<number> {
  const { data: nq } = await supabaseServer
    .from("notebook_questions")
    .select("question_id")
    .eq("notebook_id", notebookId)

  const questionIds = (nq ?? []).map((r) => r.question_id as string)
  if (!questionIds.length) return 0

  const { data, error } = await supabaseServer
    .from("question_note_entries")
    .update({
      ai_processed_at: null,
      ai_classify: null,
      ai_feedback: null,
      ai_audit_zone: null,
      ai_model_used: null,
    })
    .eq("user_id", userId)
    .in("question_id", questionIds)
    .select("id")

  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

export async function persistNoteEntryAiResult(
  entryId: string,
  patch: {
    ai_classify?: Record<string, unknown> | null
    ai_feedback?: string | null
    ai_audit_zone?: string | null
    ai_model_used?: string | null
    mergeClassify?: boolean
  }
) {
  const updates: Record<string, unknown> = {
    ai_processed_at: new Date().toISOString(),
  }
  if (patch.ai_feedback !== undefined) updates.ai_feedback = patch.ai_feedback
  if (patch.ai_audit_zone !== undefined) updates.ai_audit_zone = patch.ai_audit_zone
  if (patch.ai_model_used !== undefined) updates.ai_model_used = patch.ai_model_used

  if (patch.ai_classify !== undefined) {
    if (patch.mergeClassify) {
      const { data: existing } = await supabaseServer
        .from("question_note_entries")
        .select("ai_classify")
        .eq("id", entryId)
        .maybeSingle()
      const prev = (existing?.ai_classify as Record<string, unknown>) ?? {}
      updates.ai_classify = { ...prev, ...patch.ai_classify }
    } else {
      updates.ai_classify = patch.ai_classify
    }
  }

  await supabaseServer
    .from("question_note_entries")
    .update(updates)
    .eq("id", entryId)
}
