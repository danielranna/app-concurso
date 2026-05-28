import { NextResponse } from "next/server"
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

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await parseTecPdfPipeline(buffer)

    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao analisar PDF"
    console.error("[import/parse]", message, e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
