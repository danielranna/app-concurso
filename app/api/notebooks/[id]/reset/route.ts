import { NextResponse } from "next/server"
import { resetNotebookProgress } from "@/lib/question-study"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: notebookId } = await params
  const body = await req.json()
  const { user_id, mode, reset_timer } = body as {
    user_id: string
    mode: "all" | "wrong"
    reset_timer?: boolean
  }

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }
  if (mode !== "all" && mode !== "wrong") {
    return NextResponse.json(
      { error: 'mode deve ser "all" ou "wrong"' },
      { status: 400 }
    )
  }

  try {
    const result = await resetNotebookProgress(notebookId, user_id, mode, {
      resetTimer: reset_timer,
    })
    if (mode === "wrong" && result.deletedCount === 0 && result.wrongRemaining === 0) {
      return NextResponse.json(
        { error: "Nenhuma questão errada para refazer" },
        { status: 404 }
      )
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    const status = msg === "Não autorizado" ? 403 : msg === "Caderno não encontrado" ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
