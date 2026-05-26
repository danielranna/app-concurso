import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { createNotebookFromQuestionIds } from "@/lib/notebook-from-performance"
import { pickWrongIdsFromNotebook } from "@/lib/question-study"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sourceNotebookId } = await params
  const body = await req.json()
  const { user_id, name: customName } = body as { user_id: string; name?: string }

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data: source, error: srcErr } = await supabaseServer
    .from("notebooks")
    .select("id, name, subject_id, folder_id, user_id")
    .eq("id", sourceNotebookId)
    .single()

  if (srcErr || !source) {
    return NextResponse.json({ error: "Caderno não encontrado" }, { status: 404 })
  }
  if (source.user_id !== user_id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  }

  try {
    const questionIds = await pickWrongIdsFromNotebook(sourceNotebookId, user_id)
    if (!questionIds.length) {
      return NextResponse.json(
        { error: "Nenhuma questão errada neste caderno" },
        { status: 404 }
      )
    }

    const nbName =
      customName?.trim() ||
      `${source.name} — Erradas`.slice(0, 120)

    const subjectId = source.subject_id
    if (!subjectId) {
      return NextResponse.json(
        { error: "Associe o caderno a uma matéria antes de criar o de erradas" },
        { status: 400 }
      )
    }

    const notebook_id = await createNotebookFromQuestionIds(
      user_id,
      nbName,
      subjectId,
      questionIds,
      source.folder_id
    )

    return NextResponse.json({
      notebook_id,
      question_count: questionIds.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
