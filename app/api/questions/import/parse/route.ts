import { NextResponse } from "next/server"
import { fetchBankQuestionsByTecIds } from "@/lib/question-import"
import { loadPdfTextCorrectionConfig } from "@/lib/pdf-text-corrections"
import { parseTecPdfPipeline } from "@/lib/tec-pdf-parse-pipeline"

export const runtime = "nodejs"
export const maxDuration = 90

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "file é obrigatório" }, { status: 400 })
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF maior que 15 MB" }, { status: 400 })
    }

    await loadPdfTextCorrectionConfig()
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await parseTecPdfPipeline(buffer)
    const existingByTecId = await fetchBankQuestionsByTecIds(
      result.questions.map((q) => q.tec_id)
    )

    return NextResponse.json({
      ...result,
      questions: result.questions.map((q) => ({
        ...q,
        existing_in_bank: existingByTecId.get(q.tec_id) ?? null,
        replace_in_bank: false,
      })),
      stats: {
        ...result.stats,
        already_in_bank: existingByTecId.size,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao analisar PDF"
    console.error("[import/parse]", message, e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
