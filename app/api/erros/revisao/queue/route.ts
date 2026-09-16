import { NextResponse } from "next/server"
import { getStudyQueue } from "@/lib/flashcard-queue"
import {
  ensureErrorReviewDeck,
  decodeErrorReviewBack,
  getErrorReviewRetention,
  resolveErrorReviewFsrsParams,
} from "@/lib/error-review-flashcard"
import { supabaseServer } from "@/lib/supabase-server"
import {
  buildScheduler,
  deserializeFsrsCard,
  previewLabels,
} from "@/lib/fsrs-scheduler"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  if (!user_id) {
    return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
  }

  try {
    const deckId = await ensureErrorReviewDeck(user_id)
    const retentionInfo = await getErrorReviewRetention(user_id)
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
        request_retention: retentionInfo.request_retention,
        generating,
        awaiting_card_count: awaitingCard ?? 0,
        pending_jobs: pendingJobs ?? 0,
      })
    }

    const row = rows[0]
    const fc = row.flashcards
    const decoded = decodeErrorReviewBack(fc.back_text)
    const deckParams = await resolveErrorReviewFsrsParams(user_id)
    const fsrsCard = deserializeFsrsCard(row.state_data)
    const scheduler = buildScheduler(deckParams)
    const preview = scheduler.repeat(fsrsCard, new Date())

    let fromError: {
      id: string
      knowledge_summary: string | null
      recurrence_count: number | null
      source_question_id: string | null
    } | null = null

    const { data: linked } = await supabaseServer
      .from("errors")
      .select("id, knowledge_summary, recurrence_count, source_question_id")
      .eq("user_id", user_id)
      .eq("active_flashcard_id", fc.id)
      .limit(1)
      .maybeSingle()

    if (linked) {
      fromError = {
        id: linked.id,
        knowledge_summary: linked.knowledge_summary,
        recurrence_count: linked.recurrence_count,
        source_question_id: linked.source_question_id ?? null,
      }
    } else if ((fc as { source_error_id?: string }).source_error_id) {
      const { data: src } = await supabaseServer
        .from("errors")
        .select("id, knowledge_summary, recurrence_count, source_question_id")
        .eq("id", (fc as { source_error_id: string }).source_error_id)
        .maybeSingle()
      if (src) {
        fromError = {
          id: src.id,
          knowledge_summary: src.knowledge_summary,
          recurrence_count: src.recurrence_count,
          source_question_id: src.source_question_id ?? null,
        }
      }
    }

    let origin: {
      question_id: string | null
      tec_id: number | null
      tec_url: string | null
      statement_preview: string | null
      app_href: string | null
    } | null = null

    const sourceQuestionId = fromError?.source_question_id ?? null
    if (sourceQuestionId) {
      const { data: q } = await supabaseServer
        .from("questions")
        .select("id, tec_id, tec_url, statement")
        .eq("id", sourceQuestionId)
        .maybeSingle()
      if (q) {
        const previewText = String(q.statement ?? "").trim()
        origin = {
          question_id: q.id,
          tec_id: q.tec_id != null ? Number(q.tec_id) : null,
          tec_url: q.tec_url ? String(q.tec_url) : null,
          statement_preview:
            previewText.length > 160
              ? `${previewText.slice(0, 160)}…`
              : previewText || null,
          app_href: `/questoes/questao/${q.id}`,
        }
      } else {
        origin = {
          question_id: sourceQuestionId,
          tec_id: null,
          tec_url: null,
          statement_preview: null,
          app_href: `/questoes/questao/${sourceQuestionId}`,
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
      request_retention: retentionInfo.request_retention,
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
        origin,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
