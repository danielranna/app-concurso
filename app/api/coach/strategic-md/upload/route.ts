import { NextResponse } from "next/server"
import { importStrategicMd } from "@/lib/strategic-md-import"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const user_id = form.get("user_id") as string | null
    const exam_target_id = form.get("exam_target_id") as string | null
    const file = form.get("file") as File | null
    const title = (form.get("title") as string) || ""

    if (!user_id || !exam_target_id || !file) {
      return NextResponse.json(
        { error: "user_id, exam_target_id e file obrigatórios" },
        { status: 400 }
      )
    }

    const name = file.name.toLowerCase()
    if (!name.endsWith(".md") && !name.endsWith(".markdown")) {
      return NextResponse.json(
        { error: "Envie um arquivo Markdown (.md)" },
        { status: 400 }
      )
    }

    const markdown = await file.text()
    const result = await importStrategicMd({
      userId: user_id,
      examTargetId: exam_target_id,
      markdown,
      title: title || file.name,
    })

    return NextResponse.json({
      document: result.document,
      parse_stats: result.document.parsed_tables?.parse_stats,
      subject_mappings: result.subject_mappings,
      rows_inserted: result.rows_inserted,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
