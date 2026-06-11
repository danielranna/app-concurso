import { NextResponse } from "next/server"
import {
  fetchBankQuestionsByTecIds,
  filterQuestionsForImport,
  importNotebookFromParsed,
  type ImportSharedLinkInput,
} from "@/lib/question-import"
import type { ImportQuestionInput, ParsedTecNotebook } from "@/lib/question-types"

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
  questions: ImportQuestionInput[]
  shared_links?: ImportSharedLinkInput[]
  only_linked_questions?: boolean
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CommitBody
    const {
      user_id,
      subject_id,
      folder_id,
      name,
      notebook,
      questions,
      shared_links,
      only_linked_questions,
    } = body
    const onlyLinked = only_linked_questions === true

    if (!user_id || !notebook?.name || !Array.isArray(questions)) {
      return NextResponse.json(
        { error: "user_id, notebook.name e questions são obrigatórios" },
        { status: 400 }
      )
    }

    const questionsToImport = filterQuestionsForImport(questions, shared_links, onlyLinked)

    if (onlyLinked && questionsToImport.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nenhuma questão vinculada a conteúdo. Volte ao passo de conteúdos e associe ao menos uma questão.",
        },
        { status: 400 }
      )
    }

    const existingByTecId = await fetchBankQuestionsByTecIds(
      questionsToImport.map((q) => q.tec_id)
    )

    const missingAnswer = questionsToImport.filter((q) => {
      const keepingBank = existingByTecId.has(q.tec_id) && !q.replace_in_bank
      return !keepingBank && !q.correct_answer?.trim()
    })

    if (missingAnswer.length > 0) {
      return NextResponse.json(
        {
          error: `${missingAnswer.length} questão(ões) sem gabarito. Corrija antes de salvar.`,
          tec_ids: missingAnswer.map((q) => q.tec_id),
        },
        { status: 400 }
      )
    }

    const parsed: ParsedTecNotebook & { questions: ImportQuestionInput[] } = {
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
      shared_links: shared_links ?? [],
      only_linked_questions: onlyLinked,
    })

    return NextResponse.json({
      ...result,
      question_count: questionsToImport.length,
      parsed_name: parsed.name,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao salvar importação"
    console.error("[import/commit]", message, e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
