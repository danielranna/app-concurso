import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import type { StoredNotebookDocument } from "@/lib/blocknote/types"
import {
  getOrMigrateErrorNotebook,
  ingestErrorNotebookFromReport,
  loadAiErrorNotebook,
} from "@/lib/ai/error-notebook-ingest"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const { subjectId } = await params
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data: sub } = await supabaseServer
    .from("subjects")
    .select("name")
    .eq("id", subjectId)
    .maybeSingle()

  const subjectName = sub?.name ?? "Matéria"
  const { row, stale, latestReportIds } = await loadAiErrorNotebook(
    user_id,
    subjectId
  )

  const document = await getOrMigrateErrorNotebook(
    user_id,
    subjectId,
    subjectName
  )

  return NextResponse.json({
    document: document as StoredNotebookDocument,
    source_report_ids: row?.source_report_ids ?? [],
    last_report_id: row?.last_report_id ?? null,
    model_used: row?.model_used ?? null,
    updated_at: row?.updated_at ?? null,
    stale,
    latest_report_ids: latestReportIds,
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  const { subjectId } = await params
  const body = await req.json()
  const { user_id, report_id, skip_llm } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data: sub } = await supabaseServer
    .from("subjects")
    .select("name")
    .eq("id", subjectId)
    .maybeSingle()

  const subjectName = sub?.name ?? "Matéria"

  let reportId = report_id as string | undefined
  if (!reportId) {
    const { data: latest } = await supabaseServer
      .from("subject_notebook_reports")
      .select("id")
      .eq("user_id", user_id)
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    reportId = latest?.id
  }

  if (!reportId) {
    return NextResponse.json({
      ok: false,
      reason: "Nenhum relatório disponível para atualizar o caderno de erros.",
    })
  }

  const result = await ingestErrorNotebookFromReport({
    userId: user_id,
    subjectId,
    subjectName,
    reportId,
    skipLlm: Boolean(skip_llm),
  })

  return NextResponse.json(result)
}
