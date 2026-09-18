import { NextResponse } from "next/server"
import { getStudyQueue } from "@/lib/flashcard-queue"
import {
  ensureErrorReviewDeck,
  decodeErrorReviewBack,
  getErrorReviewRetention,
  resolveErrorReviewFsrsParams,
} from "@/lib/error-review-flashcard"
import {
  firstReviewPreviewLabels,
  isFirstErrorReview,
} from "@/lib/error-review-answer"
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
      { deckId, includeErrorReviewDeck: true }
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
    decodeErrorReviewBack(fc.back_text)
    const deckParams = await resolveErrorReviewFsrsParams(user_id)
    const fsrsCard = deserializeFsrsCard(row.state_data)
    const scheduler = buildScheduler(deckParams)
    const preview = scheduler.repeat(fsrsCard, new Date())
    const labels = previewLabels(preview)
    const first = isFirstErrorReview(fsrsCard)

    let fromError: {
      id: string
      recurrence_count: number | null
      source_question_id: string | null
      subject_id: string | null
      subject_name: string | null
    } | null = null

    const { data: linked } = await supabaseServer
      .from("errors")
      .select(
        "id, recurrence_count, source_question_id, topics(subject_id, subjects(id, name))"
      )
      .eq("user_id", user_id)
      .eq("active_flashcard_id", fc.id)
      .limit(1)
      .maybeSingle()

    function parseSubject(row: {
      topics?:
        | {
            subject_id?: string
            subjects?: { id?: string; name?: string } | { id?: string; name?: string }[]
          }
        | {
            subject_id?: string
            subjects?: { id?: string; name?: string } | { id?: string; name?: string }[]
          }[]
        | null
    }) {
      const topics = row.topics
      const t = Array.isArray(topics) ? topics[0] : topics
      if (!t) return { subject_id: null as string | null, subject_name: null as string | null }
      const sub = t.subjects
      const s = Array.isArray(sub) ? sub[0] : sub
      return {
        subject_id: (s?.id as string) ?? (t.subject_id as string) ?? null,
        subject_name: (s?.name as string) ?? null,
      }
    }

    if (linked) {
      const sub = parseSubject(linked as never)
      fromError = {
        id: linked.id,
        recurrence_count: linked.recurrence_count,
        source_question_id: linked.source_question_id ?? null,
        ...sub,
      }
    } else if ((fc as { source_error_id?: string }).source_error_id) {
      const { data: src } = await supabaseServer
        .from("errors")
        .select(
          "id, recurrence_count, source_question_id, topics(subject_id, subjects(id, name))"
        )
        .eq("id", (fc as { source_error_id: string }).source_error_id)
        .maybeSingle()
      if (src) {
        const sub = parseSubject(src as never)
        fromError = {
          id: src.id,
          recurrence_count: src.recurrence_count,
          source_question_id: src.source_question_id ?? null,
          ...sub,
        }
      }
    }

    let origin: {
      question_id: string | null
      tec_id: number | null
      tec_url: string | null
      app_href: string | null
    } | null = null

    const sourceQuestionId = fromError?.source_question_id ?? null
    if (sourceQuestionId) {
      const { data: q } = await supabaseServer
        .from("questions")
        .select("id, tec_id, tec_url")
        .eq("id", sourceQuestionId)
        .maybeSingle()
      if (q) {
        origin = {
          question_id: q.id,
          tec_id: q.tec_id != null ? Number(q.tec_id) : null,
          tec_url: q.tec_url ? String(q.tec_url) : null,
          app_href: `/questoes/questao/${q.id}`,
        }
      } else {
        origin = {
          question_id: sourceQuestionId,
          tec_id: null,
          tec_url: null,
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
      preview: first ? firstReviewPreviewLabels(labels.again) : labels,
      card: {
        id: fc.id,
        statement: fc.front_text,
        type: "certo_errado",
        from_error: Boolean(fromError),
        is_first_review: first,
        recurrence_count: fromError?.recurrence_count ?? null,
        error_id: fromError?.id ?? null,
        subject_id: fromError?.subject_id ?? null,
        subject_name: fromError?.subject_name ?? null,
        origin,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
