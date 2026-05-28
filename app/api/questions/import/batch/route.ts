import { NextResponse } from "next/server"
import { loadPdfTextCorrectionConfig } from "@/lib/pdf-text-corrections"
import { parseTecPdf } from "@/lib/tec-pdf-parser"
import { importNotebookFromParsed } from "@/lib/question-import"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const user_id = form.get("user_id") as string | null
    const subject_id = form.get("subject_id") as string | null
    const folder_id = (form.get("folder_id") as string) || null

    if (!user_id) {
      return NextResponse.json({ error: "user_id é obrigatório" }, { status: 400 })
    }

    const files = form.getAll("files").filter((f): f is File => f instanceof File)
    if (files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 })
    }

    await loadPdfTextCorrectionConfig()
    const results = []
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const parsed = await parseTecPdf(buffer)
      const name = (form.get(`name_${file.name}`) as string) || parsed.name
      const result = await importNotebookFromParsed(user_id, parsed, {
        subject_id: subject_id || null,
        folder_id,
        name,
      })
      results.push({ file: file.name, ...result })
    }

    return NextResponse.json({ notebooks: results })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro no import em lote" },
      { status: 500 }
    )
  }
}
