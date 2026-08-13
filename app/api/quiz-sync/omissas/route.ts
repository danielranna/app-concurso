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

    const { data: bank } = tecIds.length
      ? await supabaseServer
          .from("questions")
          .select("id, tec_id")
          .in("tec_id", tecIds)
      : { data: [] as { id: string; tec_id: number }[] }

    const byTec = new Map((bank ?? []).map((r) => [Number(r.tec_id), r.id]))
    const queue: {
      question_id: string
      tec_id: number
      notebook_id: string
      position: number
      short_id: string
    }[] = []

    for (const q of questions) {
      const tecId = Number(q.tecId)
      const questionId = byTec.get(tecId)
      if (!questionId) continue
      let notebookId = ""
      const { data: link } = await supabaseServer
        .from("quiz_question_links")
        .select("notebook_id")
        .eq("tec_id", tecId)
        .limit(1)
        .maybeSingle()
      if (link?.notebook_id) {
        notebookId = await ensureReplica(link.notebook_id, user_id)
      }
      queue.push({
        question_id: questionId,
        tec_id: tecId,
        notebook_id: notebookId,
        position: queue.length,
        short_id: String(q.shortId || ""),
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
