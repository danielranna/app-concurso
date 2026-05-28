import { NextResponse } from "next/server"
import { importNotebookFromParsed } from "@/lib/question-import"
import type { ParsedTecNotebook, ParsedTecQuestion } from "@/lib/question-types"

export const runtime = "nodejs"
export const maxDuration = 60

type CommitBody = {
  user_id: string
  subject_id?: string | null
  folder_id?: string | null
  name?: string
  notebook: {
    name: string
    share_url: string | null
    ordering: string | null
    warnings?: string[]
  }
  questions: ParsedTecQuestion[]
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CommitBody
    const { user_id, subject_id, folder_id, name, notebook, questions } = body

    if (!user_id || !notebook?.name || !Array.isArray(questions)) {
      return NextResponse.json(
        { error: "user_id, notebook.name e questions são obrigatórios" },
        { status: 400 }
      )
    }

    const missingAnswer = questions.filter((q) => !q.correct_answer?.trim())
    if (missingAnswer.length > 0) {
      return NextResponse.json(
        {
          error: `${missingAnswer.length} questão(ões) sem gabarito. Corrija antes de salvar.`,
          tec_ids: missingAnswer.map((q) => q.tec_id),
        },
        { status: 400 }
      )
    }

    const parsed: ParsedTecNotebook = {
      name: notebook.name,
      share_url: notebook.share_url ?? null,
      ordering: notebook.ordering ?? null,
      questions,
      warnings: notebook.warnings ?? [],
    }

    const result = await importNotebookFromParsed(user_id, parsed, {
      subject_id: subject_id ?? null,
      folder_id: folder_id ?? null,
      name,
    })

    return NextResponse.json({
      ...result,
      question_count: questions.length,
      parsed_name: parsed.name,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao salvar importação"
    console.error("[import/commit]", message, e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
