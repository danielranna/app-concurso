import { NextResponse } from "next/server"
import {
  buildNotebookFullQueue,
  getLatestNotebookAttempt,
  loadNotebookAttemptRows,
  loadQuestionForStudy,
  pendingFromFullQueue,
  statsFromAttemptRows,
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

  try {
    const [fullQueue, attemptRows, nbRes] = await Promise.all([
      buildNotebookFullQueue(id),
      loadNotebookAttemptRows(id, user_id),
      supabaseServer
        .from("notebooks")
        .select(
          "question_count, name, study_elapsed_ms, active_question_id, report_pending"
        )
        .eq("id", id)
        .single(),
    ])

    const nb = nbRes.data
    const answeredIds = new Set(attemptRows.map((a) => a.question_id))
    const pendingQueue = pendingFromFullQueue(fullQueue, answeredIds)
    const attemptStats = statsFromAttemptRows(attemptRows)

    let currentId = questionIdParam ?? nb?.active_question_id ?? null

    if (navParam && NAV_MODES.has(navParam)) {
      const target = pickNavigationTarget(
        fullQueue,
        pendingQueue,
        currentId,
        navParam as NavMode
      )
      currentId = target?.question_id ?? null
    } else if (questionIdParam) {
      if (!fullQueue.some((q) => q.question_id === currentId)) {
        currentId =
          defaultPendingTarget(pendingQueue, null, fullQueue)?.question_id ??
          null
      }
    } else {
      const target = defaultPendingTarget(
        pendingQueue,
        nb?.active_question_id ?? null,
        fullQueue
      )
      currentId = target?.question_id ?? null
    }

    const current =
      fullQueue.find((q) => q.question_id === currentId) ??
      pendingQueue[0] ??
      null

    const [{ question, options }, attempt] = await Promise.all([
      current
        ? loadQuestionForStudy(current.question_id, user_id)
        : Promise.resolve({ question: null, options: [] }),
      current
        ? getLatestNotebookAttempt(id, user_id, current.question_id)
        : Promise.resolve(null),
      supabaseServer
        .from("notebooks")
        .update({
          last_accessed_at: new Date().toISOString(),
          ...(current ? { active_question_id: current.question_id } : {}),
        })
        .eq("id", id),
    ])

    const position =
      current != null
        ? fullQueue.findIndex((q) => q.question_id === current.question_id) + 1
        : 0

    const pendingCount = pendingQueue.length
    const notebookDone = pendingCount === 0 && fullQueue.length > 0
    let reportId: string | null = null
    if (notebookDone) {
      const { data: reportRow } = await supabaseServer
        .from("subject_notebook_reports")
        .select("id")
        .eq("notebook_id", id)
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      reportId = reportRow?.id ?? null
    }

    return NextResponse.json({
      full_queue_length: fullQueue.length,
      current,
      question,
      options,
      attempt,
      position,
      study_elapsed_ms: nb?.study_elapsed_ms ?? 0,
      report_id: reportId,
      report_pending: Boolean(
        (nb as { report_pending?: boolean } | null)?.report_pending
      ),
      stats: {
        total: nb?.question_count ?? fullQueue.length,
        resolved: attemptStats.resolved,
        correct: attemptStats.correct,
        wrong: attemptStats.wrong,
        pending: pendingCount,
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
