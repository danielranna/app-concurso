import { NextResponse } from "next/server"
import { parseTecPdf } from "@/lib/tec-pdf-parser"
import { importNotebookFromParsed } from "@/lib/question-import"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const user_id = form.get("user_id") as string | null
    const subject_id = form.get("subject_id") as string | null
    const folder_id = (form.get("folder_id") as string) || null
    const name = (form.get("name") as string) || undefined
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

    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await parseTecPdf(buffer)
    const result = await importNotebookFromParsed(user_id, parsed, {
      subject_id: subject_id || null,
      folder_id,
      name,
    })

    return NextResponse.json({
      ...result,
      question_count: parsed.questions.length,
      parsed_name: parsed.name,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao importar PDF"
    console.error("[import/pdf]", message, e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
