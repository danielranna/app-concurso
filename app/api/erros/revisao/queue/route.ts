import { NextResponse } from "next/server"
import { getStudyQueue } from "@/lib/flashcard-queue"
import { ensureErrorReviewDeck } from "@/lib/error-review-flashcard"
import { decodeErrorReviewBack } from "@/lib/error-review-flashcard"
import { supabaseServer } from "@/lib/supabase-server"
import {
  buildScheduler,
  deserializeFsrsCard,
  previewLabels,
} from "@/lib/fsrs-scheduler"
import { resolveFsrsParams } from "@/lib/flashcard-fsrs-params"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  try {
    const deckId = await ensureErrorReviewDeck(user_id)
    const { rows, limit, totalDue, laterCount, nextDueAt } = await getStudyQueue(
      user_id,
      { deckId }
    )

    if (rows.length === 0) {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count: awaitingCard } = await supabaseServer
        .from("errors")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .not("source_question_id", "is", null)
        .is("active_flashcard_id", null)
        .gte("created_at", since)

      const { count: pendingJobs } = await supabaseServer
        .from("ai_jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("job_type", "error_review_question_generate")
        .in("status", ["pending", "running"])

      const generating =
        (awaitingCard ?? 0) > 0 || (pendingJobs ?? 0) > 0

      return NextResponse.json({
        card: null,
        remaining: 0,
        total_due: totalDue,
        daily_limit: limit,
        later_count: laterCount,
        next_due_at: nextDueAt,
        deck_id: deckId,
        generating,
        awaiting_card_count: awaitingCard ?? 0,
        pending_jobs: pendingJobs ?? 0,
      })
    }

    const row = rows[0]
    const fc = row.flashcards
    const decoded = decodeErrorReviewBack(fc.back_text)
    const deckParams = await resolveFsrsParams(user_id, fc.deck_id)
    const fsrsCard = deserializeFsrsCard(row.state_data)
    const scheduler = buildScheduler(deckParams)
    const preview = scheduler.repeat(fsrsCard, new Date())

    let fromError: {
      id: string
      knowledge_summary: string | null
      recurrence_count: number | null
    } | null = null

    const { data: linked } = await supabaseServer
      .from("errors")
      .select("id, knowledge_summary, recurrence_count")
      .eq("user_id", user_id)
      .eq("active_flashcard_id", fc.id)
      .limit(1)
      .maybeSingle()

    if (linked) {
      fromError = {
        id: linked.id,
        knowledge_summary: linked.knowledge_summary,
        recurrence_count: linked.recurrence_count,
      }
    } else if ((fc as { source_error_id?: string }).source_error_id) {
      const { data: src } = await supabaseServer
        .from("errors")
        .select("id, knowledge_summary, recurrence_count")
        .eq("id", (fc as { source_error_id: string }).source_error_id)
        .maybeSingle()
      if (src) {
        fromError = {
          id: src.id,
          knowledge_summary: src.knowledge_summary,
          recurrence_count: src.recurrence_count,
        }
      }
    }

    return NextResponse.json({
      deck_id: deckId,
      state_id: row.id,
      remaining: Math.max(0, rows.length - 1),
      total_due: totalDue,
      daily_limit: limit,
      later_count: laterCount,
      next_due_at: nextDueAt,
      preview: previewLabels(preview),
      card: {
        id: fc.id,
        statement: fc.front_text,
        type: "certo_errado",
        from_error: Boolean(fromError),
        knowledge_summary:
          fromError?.knowledge_summary ?? decoded?.knowledge_summary ?? null,
        recurrence_count: fromError?.recurrence_count ?? null,
        error_id: fromError?.id ?? null,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
