import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  ensureReplica,
  fetchOmissasFromQuiz,
  resolveUserIdByJid,
  retryFailedIngests,
} from "@/lib/quiz-sync"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get("t") || url.searchParams.get("token") || ""
  const user_id = url.searchParams.get("user_id") || ""
  if (!token || !user_id) {
    return NextResponse.json({ error: "t e user_id obrigatórios" }, { status: 400 })
  }
  try {
    const payload = await fetchOmissasFromQuiz(token)
    const linkedUser = payload.userJid
      ? await resolveUserIdByJid(String(payload.userJid))
      : null
    if (linkedUser && linkedUser !== user_id) {
      return NextResponse.json({ error: "Esta sessão pertence a outro usuário." }, { status: 403 })
    }

    const questions = Array.isArray(payload.questions) ? payload.questions : []
    const tecIds = questions
      .map((q: { tecId?: number }) => Number(q.tecId))
      .filter((n: number) => Number.isFinite(n) && n > 0)
    const shortIds = questions
      .map((q: { shortId?: string }) => String(q.shortId || "").trim().toUpperCase())
      .filter(Boolean)

    const { data: bank } = tecIds.length
      ? await supabaseServer
          .from("questions")
          .select("id, tec_id")
          .in("tec_id", tecIds)
      : { data: [] as { id: string; tec_id: number }[] }

    const { data: shortLinks } = shortIds.length
      ? await supabaseServer
          .from("quiz_question_links")
          .select("question_id, notebook_id, tec_id, short_id")
          .in("short_id", shortIds)
      : { data: [] as { question_id: string; notebook_id: string; tec_id: number; short_id: string }[] }

    const byTec = new Map((bank ?? []).map((r) => [Number(r.tec_id), r.id]))
    const byShort = new Map(
      (shortLinks ?? []).map((r) => [String(r.short_id).toUpperCase(), r])
    )
    const queue: {
      question_id: string
      tec_id: number
      notebook_id: string
      position: number
      short_id: string
    }[] = []

    for (const q of questions) {
      const tecId = Number(q.tecId)
      const shortId = String(q.shortId || "").trim().toUpperCase()
      const shortLink = shortId ? byShort.get(shortId) : undefined
      const questionId =
        (Number.isFinite(tecId) && tecId > 0 ? byTec.get(tecId) : undefined) ||
        shortLink?.question_id
      if (!questionId) continue
      let notebookId = ""
      const { data: link } =
        Number.isFinite(tecId) && tecId > 0
          ? await supabaseServer
              .from("quiz_question_links")
              .select("notebook_id")
              .eq("tec_id", tecId)
              .limit(1)
              .maybeSingle()
          : { data: shortLink ? { notebook_id: shortLink.notebook_id } : null }
      const sourceNb = link?.notebook_id || shortLink?.notebook_id
      if (sourceNb) {
        notebookId = await ensureReplica(sourceNb, user_id)
      }
      queue.push({
        question_id: questionId,
        tec_id: Number.isFinite(tecId) && tecId > 0 ? tecId : Number(shortLink?.tec_id) || 0,
        notebook_id: notebookId,
        position: queue.length,
        short_id: shortId,
      })
    }

    const qids = queue.map((q) => q.question_id)
    const { data: qrows } = qids.length
      ? await supabaseServer
          .from("questions")
          .select("id, statement, correct_answer, type, tec_url")
          .in("id", qids)
      : { data: [] as { id: string; statement: string; correct_answer: string; type: string; tec_url: string }[] }
    const qById = new Map((qrows ?? []).map((r) => [r.id, r]))

    const { data: attemptRows } = qids.length
      ? await supabaseServer
          .from("question_attempts")
          .select(
            "question_id, is_correct, selected_answer, duration_ms, confidence_level, created_at"
          )
          .eq("user_id", user_id)
          .in("question_id", qids)
          .order("created_at", { ascending: false })
      : { data: [] as { question_id: string; is_correct: boolean; selected_answer: string; duration_ms: number | null; confidence_level: string | null; created_at: string }[] }

    const attempts: Record<
      string,
      {
        is_correct: boolean
        selected_answer: string
        duration_ms: number | null
        confidence_level: string | null
      }
    > = {}
    for (const a of attemptRows ?? []) {
      if (attempts[a.question_id]) continue
      attempts[a.question_id] = {
        is_correct: Boolean(a.is_correct),
        selected_answer: a.selected_answer,
        duration_ms: a.duration_ms,
        confidence_level: a.confidence_level,
      }
    }

    const items = queue.map((q) => {
      const meta = qById.get(q.question_id)
      const att = attempts[q.question_id]
      return {
        ...q,
        statement: meta?.statement ?? "",
        correct_answer: meta?.correct_answer ?? "",
        type: meta?.type ?? "",
        tec_url: meta?.tec_url ?? "",
        attempt: att ?? null,
      }
    })

    if (Object.keys(attempts).length) {
      await retryFailedIngests(user_id).catch(() => {})
    }

    const resolved = Object.keys(attempts).length
    const correct = Object.values(attempts).filter((a) => a.is_correct).length
    return NextResponse.json({
      mode: payload.mode,
      userJid: payload.userJid,
      total: queue.length,
      queue: items,
      attempts,
      stats: {
        total: queue.length,
        resolved,
        correct,
        wrong: resolved - correct,
        pending: Math.max(0, queue.length - resolved),
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
