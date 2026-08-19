import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  ensureReplica,
  fetchOmissasFromQuiz,
  resolveUserIdByJid,
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

    return NextResponse.json({
      mode: payload.mode,
      userJid: payload.userJid,
      total: queue.length,
      queue,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
