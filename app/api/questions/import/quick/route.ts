import { NextResponse } from "next/server"
import { importNotebookFromParsed } from "@/lib/question-import"
import { loadPdfTextCorrectionConfig } from "@/lib/pdf-text-corrections"
import {
  notebookParseResultToParsed,
  parseTecPdfPipeline,
} from "@/lib/tec-pdf-parse-pipeline"

export const runtime = "nodejs"
export const maxDuration = 90

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const user_id = form.get("user_id") as string | null
    const subject_id = (form.get("subject_id") as string) || null
    const folder_id = (form.get("folder_id") as string) || null
    const file = form.get("file") as File | null

    if (!user_id || !file) {
      return NextResponse.json(
        { error: "user_id e file são obrigatórios" },
        { status: 400 }
      )
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF maior que 15 MB" }, { status: 400 })
    }

    await loadPdfTextCorrectionConfig()
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsedNotebook = await parseTecPdfPipeline(buffer)
    const parsed = notebookParseResultToParsed(parsedNotebook)

    const result = await importNotebookFromParsed(user_id, parsed, {
      subject_id: subject_id || null,
      folder_id: folder_id || null,
    })

    return NextResponse.json({
      file_name: file.name,
      parsed_name: parsed.name,
      ...result,
      question_count: result.notebook_question_count,
      stats: parsedNotebook.stats,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao importar PDF"
    console.error("[import/quick]", message, e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
