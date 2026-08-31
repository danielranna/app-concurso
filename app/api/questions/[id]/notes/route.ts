import { NextResponse } from "next/server"
import {
  insertQuestionNote,
  latestAttemptForQuestion,
  toPublicNoteEntry,
} from "@/lib/question-notes"
import { supabaseServer } from "@/lib/supabase-server"
import { enqueueQuestionResolveAi } from "@/lib/ai/question-resolve-ai"
import { scheduleQuestionAiKick } from "@/lib/ai/jobs/kick"

export const maxDuration = 120

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: question_id } = await params
  const user_id = new URL(req.url).searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from("question_note_entries")
    .select("id, body, created_at, ai_processed_at, ai_feedback")
    .eq("user_id", user_id)
    .eq("question_id", question_id)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const attempt = await latestAttemptForQuestion(user_id, question_id)
  const entries = (data ?? []).map((row) =>
    toPublicNoteEntry(row, { expectAi: Boolean(attempt) })
  )

  return NextResponse.json({ entries })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: question_id } = await params
  const body = await req.json()
  const { user_id, body: noteBody } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const entry = await insertQuestionNote(user_id, question_id, String(noteBody ?? ""))
    const attempt = await latestAttemptForQuestion(user_id, question_id)
    if (attempt) {
      await enqueueQuestionResolveAi({
        userId: user_id,
        questionId: question_id,
        attemptId: attempt.id,
        notebookId: attempt.notebook_id,
        selectedAnswer: attempt.selected_answer,
        confidenceLevel: attempt.confidence_level,
        durationMs: attempt.duration_ms,
        pushWhatsapp: false,
        idempotencyKey: `question_ai:${attempt.id}:note:${entry.id}`,
      })
      scheduleQuestionAiKick(user_id)
    }
    return NextResponse.json({
      entry: { ...entry, ai_pending: Boolean(attempt) && entry.ai_pending },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao salvar"
    const status = msg.includes("Escreva algo") ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
