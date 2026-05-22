import { NextResponse } from "next/server"
import { parseTecPdf } from "@/lib/tec-pdf-parser"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "file é obrigatório" }, { status: 400 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await parseTecPdf(buffer)
    return NextResponse.json({
      name: parsed.name,
      share_url: parsed.share_url,
      ordering: parsed.ordering,
      question_count: parsed.questions.length,
      warnings: parsed.warnings,
      preview: parsed.questions.slice(0, 5).map((q) => ({
        tec_id: q.tec_id,
        type: q.type,
        tec_subject: q.tec_subject,
        tec_topic: q.tec_topic,
        statement: q.statement.slice(0, 200),
        correct_answer: q.correct_answer,
        options_count: q.options.length,
      })),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro no preview"
    console.error("[import/preview]", message, e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
