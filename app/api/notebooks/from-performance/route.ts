import { NextResponse } from "next/server"
import {
  createNotebookFromQuestionIds,
  pickQuestionIdsFromPerformance,
  type PerformanceNotebookRules,
} from "@/lib/notebook-from-performance"

export async function POST(req: Request) {
  const body = await req.json()
  const {
    user_id,
    name,
    subject_id,
    folder_id,
    rules,
    question_ids,
    library_saved,
  } = body as {
    user_id: string
    name: string
    subject_id: string
    folder_id?: string
    rules?: PerformanceNotebookRules
    question_ids?: string[]
    library_saved?: boolean
  }

  if (!user_id || !name || !subject_id) {
    return NextResponse.json(
      { error: "user_id, name e subject_id obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const fromIds = Array.isArray(question_ids)
      ? question_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : []

    const questionIds =
      fromIds.length > 0
        ? fromIds.slice(0, 200)
        : await pickQuestionIdsFromPerformance(user_id, {
            ...rules,
            subject_id,
          })

    if (!questionIds.length) {
      return NextResponse.json(
        { error: "Nenhuma questão encontrada com essas regras" },
        { status: 404 }
      )
    }

    const notebook_id = await createNotebookFromQuestionIds(
      user_id,
      name,
      subject_id,
      questionIds,
      folder_id,
      library_saved ?? true
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
