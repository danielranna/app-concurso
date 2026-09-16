import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { enqueueJob } from "@/lib/ai/jobs/queue"
import { runJobWorker } from "@/lib/ai/jobs/worker"

/**
 * Reprocessa erros automáticos recentes sem card C/E
 * (útil quando o kick anterior falhou ou o job ficou preso).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const user_id = body.user_id as string
  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: pendingErrors } = await supabaseServer
    .from("errors")
    .select("id, source_question_id, source_attempt_id")
    .eq("user_id", user_id)
    .not("source_question_id", "is", null)
    .is("active_flashcard_id", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20)

  let enqueued = 0
  for (const err of pendingErrors ?? []) {
    if (!err.source_question_id) continue
    const attemptId =
      (err.source_attempt_id as string) || `backfill:${err.id}`
    await enqueueJob({
      userId: user_id,
      jobType: "error_review_question_generate",
      idempotencyKey: `error_review_q:${attemptId}`,
      payload: {
        error_id: err.id,
        question_id: err.source_question_id,
        attempt_id: err.source_attempt_id,
      },
      priority: 30,
    })
    enqueued++
  }

  const results = await runJobWorker(Math.min(10, Math.max(3, enqueued || 3)), {
    userId: user_id,
    jobTypes: ["error_review_question_generate"],
  })

  return NextResponse.json({
    pending_errors: pendingErrors?.length ?? 0,
    enqueued,
    processed: results.length,
    results,
  })
}
