import { NextResponse } from "next/server"
import {
  buildNotebookFullQueue,
  buildNotebookQueue,
  getNotebookAttemptStats,
  loadQuestionForStudy,
} from "@/lib/question-study"
import {
  defaultPendingTarget,
  pickNavigationTarget,
  type NavMode,
} from "@/lib/study-navigation"
import { supabaseServer } from "@/lib/supabase-server"

const NAV_MODES = new Set(["next", "prev", "random", "unsolved"])

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

  const navParam = url.searchParams.get("nav")
  const questionIdParam = url.searchParams.get("question_id")

  await supabaseServer
    .from("notebooks")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", id)

  try {
    const fullQueue = await buildNotebookFullQueue(id)
    const pendingQueue = await buildNotebookQueue(id, user_id)
    const attemptStats = await getNotebookAttemptStats(id, user_id)

    const { data: nb } = await supabaseServer
      .from("notebooks")
      .select("question_count, name, study_elapsed_ms, active_question_id")
      .eq("id", id)
      .single()

    let currentId =
      questionIdParam ?? nb?.active_question_id ?? null

    if (navParam && NAV_MODES.has(navParam)) {
      const target = pickNavigationTarget(
        fullQueue,
        pendingQueue,
        currentId,
        navParam as NavMode
      )
      currentId = target?.question_id ?? null
    } else if (!currentId) {
      const target = defaultPendingTarget(
        pendingQueue,
        nb?.active_question_id ?? null,
        fullQueue
      )
      currentId = target?.question_id ?? null
    } else if (!fullQueue.some((q) => q.question_id === currentId)) {
      currentId = defaultPendingTarget(pendingQueue, null, fullQueue)?.question_id ?? null
    } else if (!currentId && fullQueue.length > 0) {
      currentId = nb?.active_question_id ?? fullQueue[0].question_id
    }

    if (currentId) {
      await supabaseServer
        .from("notebooks")
        .update({ active_question_id: currentId })
        .eq("id", id)
    }

    const current =
      fullQueue.find((q) => q.question_id === currentId) ??
      pendingQueue[0] ??
      null

    const { question, options } = current
      ? await loadQuestionForStudy(current.question_id)
      : { question: null, options: [] }

    const position =
      current != null
        ? fullQueue.findIndex((q) => q.question_id === current.question_id) + 1
        : 0

    return NextResponse.json({
      queue: pendingQueue,
      full_queue_length: fullQueue.length,
      current,
      question,
      options,
      position,
      study_elapsed_ms: nb?.study_elapsed_ms ?? 0,
      stats: {
        total: nb?.question_count ?? fullQueue.length,
        resolved: attemptStats.resolved,
        correct: attemptStats.correct,
        wrong: attemptStats.wrong,
        pending: pendingQueue.length,
      },
      notebook: nb,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro" },
      { status: 500 }
    )
  }
}
