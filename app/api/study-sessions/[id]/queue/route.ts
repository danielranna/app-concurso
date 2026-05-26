import { NextResponse } from "next/server"
import { loadQuestionForStudy } from "@/lib/question-study"
import {
  defaultPendingTarget,
  pickNavigationTarget,
  type NavMode,
} from "@/lib/study-navigation"
import { supabaseServer } from "@/lib/supabase-server"
import type { StudyQueueItem } from "@/lib/question-types"

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

  const { data: session, error } = await supabaseServer
    .from("study_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user_id)
    .single()

  if (error || !session) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 })
  }

  const fullQueue = (session.queue ?? []) as StudyQueueItem[]
  const answered = new Set(session.answered_tec_ids ?? [])
  const pending = fullQueue.filter((q) => !answered.has(q.tec_id))

  let currentId =
    questionIdParam ?? session.active_question_id ?? null

  if (navParam && NAV_MODES.has(navParam)) {
    const target = pickNavigationTarget(
      fullQueue,
      pending,
      currentId,
      navParam as NavMode
    )
    currentId = target?.question_id ?? null
  } else if (!currentId) {
    const target = defaultPendingTarget(
      pending,
      session.active_question_id ?? null,
      fullQueue
    )
    currentId = target?.question_id ?? null
  } else if (!currentId && fullQueue.length > 0) {
    currentId = session.active_question_id ?? fullQueue[0].question_id
  }

  if (currentId) {
    await supabaseServer
      .from("study_sessions")
      .update({
        active_question_id: currentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
  }

  const current =
    fullQueue.find((q) => q.question_id === currentId) ?? pending[0] ?? null

  const { question, options } = current
    ? await loadQuestionForStudy(current.question_id, user_id)
    : { question: null, options: [] }

  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select("is_correct")
    .eq("user_id", user_id)
    .eq("study_session_id", id)

  const correct = (attempts ?? []).filter((a) => a.is_correct).length
  const wrong = (attempts ?? []).length - correct

  const position =
    current != null
      ? fullQueue.findIndex((q) => q.question_id === current.question_id) + 1
      : 0

  const { data: childProgress } = await supabaseServer
    .from("study_session_notebooks")
    .select("*, notebooks(name)")
    .eq("study_session_id", id)

  return NextResponse.json({
    session,
    current,
    question,
    options,
    position,
    study_elapsed_ms: session.study_elapsed_ms ?? 0,
    stats: {
      total: fullQueue.length,
      resolved: answered.size,
      correct,
      wrong,
      pending: pending.length,
    },
    child_progress: childProgress ?? [],
  })
}
