import { NextResponse } from "next/server"
import { parseTecPdfPipeline } from "@/lib/tec-pdf-parse-pipeline"

export const runtime = "nodejs"
export const maxDuration = 90

/** Legado: redireciona mentalmente para /parse; mantém resposta resumida. */
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "file é obrigatório" }, { status: 400 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await parseTecPdfPipeline(buffer)
    return NextResponse.json({
      name: result.name,
      share_url: result.share_url,
      ordering: result.ordering,
      question_count: result.questions.length,
      warnings: result.warnings,
      stats: result.stats,
      preview: result.questions.slice(0, 5).map((q) => ({
        tec_id: q.merged.tec_id,
        type: q.merged.type,
        tec_subject: q.merged.tec_subject,
        tec_topic: q.merged.tec_topic,
        statement: q.merged.statement.slice(0, 200),
        correct_answer: q.merged.correct_answer,
        options_count: q.merged.options.length,
        confidence: q.confidence,
        needs_review: q.needs_review,
        quality_flags: q.quality_flags.map((f) => f.code),
      })),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro no preview"
    console.error("[import/preview]", message, e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
