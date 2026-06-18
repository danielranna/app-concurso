import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { generateNotebookReport } from "@/lib/ai/notebook-report"
import { enqueueJob } from "@/lib/ai/jobs/queue"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { user_id, reprocess_notes } = body

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  const { data: existing } = await supabaseServer
    .from("subject_notebook_reports")
    .select("id, notebook_id, subject_id")
    .eq("id", id)
    .eq("user_id", user_id)
    .maybeSingle()

  if (!existing?.notebook_id) {
    return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 })
  }

  try {
    const report = await generateNotebookReport(
      existing.notebook_id,
      user_id,
      { force: true, reprocessNotes: Boolean(reprocess_notes) }
    )

    const { data: row, error } = await supabaseServer
      .from("subject_notebook_reports")
      .update({
        summary_md: report.summaryMd,
        structured: report.structured,
        input_snapshot: report.snapshot,
        model_used: report.modelUsed,
        tokens_in: report.tokensIn,
        tokens_out: report.tokensOut,
        cost_usd_estimate: report.costUsd,
      })
      .eq("id", id)
      .select("id")
      .single()

    if (error) throw new Error(error.message)

    if (existing.subject_id) {
      await enqueueJob({
        userId: user_id,
        jobType: "brain_ingest_report",
        idempotencyKey: `brain:${row!.id}:${Date.now()}`,
        payload: {
          subject_id: existing.subject_id,
          report_id: row!.id,
        },
        priority: 8,
      })
    }

    return NextResponse.json({ ok: true, report_id: row!.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
