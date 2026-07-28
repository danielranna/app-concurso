import { NextResponse } from "next/server"
import {
  removeQuestionFromNotebook,
  type RemoveQuestionMode,
} from "@/lib/notebook-question-remove"

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  const { id: notebookId, questionId } = await params
  const body = await req.json().catch(() => ({}))
  const { user_id, mode } = body as {
    user_id?: string
    mode?: RemoveQuestionMode
  }

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }
  if (mode !== "notebook" && mode !== "bank") {
    return NextResponse.json(
      { error: 'mode deve ser "notebook" ou "bank"' },
      { status: 400 }
    )
  }

  try {
    const result = await removeQuestionFromNotebook(
      notebookId,
      questionId,
      user_id,
      mode
    )
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    const status =
      msg === "Não autorizado"
        ? 403
        : msg === "Caderno não encontrado" || msg === "Questão não está neste caderno"
          ? 404
          : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
