import { NextResponse } from "next/server"
import { createNotebookReportSync } from "@/lib/ai/notebook-report"

export const maxDuration = 120

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const user_id = body.user_id as string | undefined
  const notebook_id = body.notebook_id as string | undefined

  if (!user_id || !notebook_id) {
    return NextResponse.json(
      { error: "user_id e notebook_id obrigatórios" },
      { status: 400 }
    )
  }

  try {
    const result = await createNotebookReportSync(notebook_id, user_id, {
      force: Boolean(body.force),
    })
    return NextResponse.json({
      ok: true,
      report_id: result.report_id,
      skipped: result.skipped,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao gerar relatório"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
