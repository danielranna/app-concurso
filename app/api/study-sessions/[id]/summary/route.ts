import { NextResponse } from "next/server"
import {
  getSessionAttemptStats,
  getStudySessionNotebookBreakdown,
} from "@/lib/question-study"
import { supabaseServer } from "@/lib/supabase-server"
import type { StudyQueueItem } from "@/lib/question-types"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(req.url)
  const user_id = url.searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data: session, error } = await supabaseServer
    .from("study_sessions")
    .select("id, name, queue, study_elapsed_ms")
    .eq("id", id)
    .eq("user_id", user_id)
    .single()

  if (error || !session) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 })
  }

  const fullQueue = (session.queue ?? []) as StudyQueueItem[]
  const attemptStats = await getSessionAttemptStats(id, user_id)
  const notebook_breakdown = await getStudySessionNotebookBreakdown(id, user_id)

  return NextResponse.json({
    session_name: session.name,
    study_elapsed_ms: session.study_elapsed_ms ?? 0,
    stats: {
      total: fullQueue.length,
      resolved: attemptStats.resolved,
      correct: attemptStats.correct,
      wrong: attemptStats.wrong,
    },
    notebook_breakdown,
  })
}
