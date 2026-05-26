import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { loadQuestionForStudy, normalizeStudyOptions } from "@/lib/question-study"

async function mergeUserEdit(
  question: Record<string, unknown>,
  options: { label: string; text: string; sort_order?: number }[],
  userId: string | null
) {
  if (!userId) return { question, options }
  const { question: merged, options: mergedOpts } = await loadQuestionForStudy(
    question.id as string,
    userId
  )
  if (!merged) return { question, options }
  return {
    question: merged,
    options: mergedOpts,
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("user_id")
  const byTec = searchParams.get("by") === "tec"

  let query = supabaseServer.from("questions").select("*")
  if (byTec) {
    query = query.eq("tec_id", parseInt(id, 10))
  } else {
    query = query.eq("id", id)
  }

  const { data: question, error } = await query.maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!question) return NextResponse.json({ error: "Não encontrada" }, { status: 404 })

  const { data: options } = await supabaseServer
    .from("question_options")
    .select("*")
    .eq("question_id", question.id)
    .order("sort_order")

  const rawOpts = (options ?? []).map((o) => ({
    label: o.label,
    text: o.text,
    sort_order: o.sort_order,
  }))

  const { question: q, options: opts } = await mergeUserEdit(question, rawOpts, userId)

  return NextResponse.json({
    question: q,
    options: normalizeStudyOptions(q.type, opts),
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: questionId } = await params
  const body = await req.json()
  const {
    user_id,
    type,
    statement,
    content_before,
    content_after,
    correct_answer,
    options,
  } = body as {
    user_id: string
    type?: "multiple_choice" | "certo_errado"
    statement?: string
    content_before?: string | null
    content_after?: string | null
    correct_answer?: string
    options?: { label: string; text: string; sort_order?: number }[]
  }

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data: question, error: qErr } = await supabaseServer
    .from("questions")
    .select("id")
    .eq("id", questionId)
    .maybeSingle()

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  if (!question) return NextResponse.json({ error: "Não encontrada" }, { status: 404 })

  const patch: Record<string, unknown> = {
    user_id,
    question_id: questionId,
    updated_at: new Date().toISOString(),
  }
  if (type != null) patch.type = type
  if (statement != null) patch.statement = statement
  if (content_before !== undefined) patch.content_before = content_before
  if (content_after !== undefined) patch.content_after = content_after
  if (correct_answer != null) patch.correct_answer = correct_answer
  if (options != null) patch.options = options

  const { error } = await supabaseServer.from("user_question_edits").upsert(patch)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
