import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  generateSubjectDossier,
  loadSubjectDossier,
} from "@/lib/ai/subject-dossier"
import { enqueueJob } from "@/lib/ai/jobs/queue"
import { runJobWorker } from "@/lib/ai/jobs/worker"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")
  const subject_id = searchParams.get("subject_id")

  if (!user_id || !subject_id) {
    return NextResponse.json(
      { error: "user_id e subject_id obrigatórios" },
      { status: 400 }
    )
  }

  const { row, stale, latestReportIds } = await loadSubjectDossier(
    user_id,
    subject_id
  )

  if (!row) {
    return NextResponse.json({
      empty: true,
      reason:
        "Nenhum Caderno de erros gerado ainda. Conclua um caderno com relatório IA.",
      stale: latestReportIds.length > 0,
      latest_report_ids: latestReportIds,
    })
  }

  return NextResponse.json({
    empty: false,
    narrative_md: row.narrative_md,
    structured: row.structured,
    source_report_ids: row.source_report_ids,
    model_used: row.model_used,
    updated_at: row.updated_at,
    stale,
    latest_report_ids: latestReportIds,
  })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { user_id, subject_id, force, async: runAsync } = body

  if (!user_id || !subject_id) {
    return NextResponse.json(
      { error: "user_id e subject_id obrigatórios" },
      { status: 400 }
    )
  }

  if (runAsync) {
    const { data: latestReport } = await supabaseServer
      .from("subject_notebook_reports")
      .select("id")
      .eq("user_id", user_id)
      .eq("subject_id", subject_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const reportId = latestReport?.id ?? "manual"
    await enqueueJob({
      userId: user_id,
      jobType: "subject_dossier_generate",
      idempotencyKey: `dossier:${subject_id}:${reportId}:${Date.now()}`,
      payload: { subject_id, force: Boolean(force) },
      priority: 9,
    })

    await runJobWorker(3, {
      userId: user_id,
      jobTypes: ["subject_dossier_generate"],
    })

    const loaded = await loadSubjectDossier(user_id, subject_id)
    if (!loaded.row) {
      return NextResponse.json({
        empty: true,
        reason:
          "Não foi possível gerar o Caderno de erros. Verifique se há relatórios com erros explicados.",
        stale: loaded.stale,
      })
    }

    return NextResponse.json({
      empty: false,
      narrative_md: loaded.row.narrative_md,
      structured: loaded.row.structured,
      source_report_ids: loaded.row.source_report_ids,
      model_used: loaded.row.model_used,
      updated_at: loaded.row.updated_at,
      stale: loaded.stale,
    })
  }

  const result = await generateSubjectDossier(user_id, subject_id, {
    force: Boolean(force),
  })

  if (result.empty) {
    return NextResponse.json({
      empty: true,
      reason: result.reason,
    })
  }

  return NextResponse.json({
    empty: false,
    narrative_md: result.dossier.narrative_md,
    structured: result.dossier.structured,
    source_report_ids: result.dossier.source_report_ids,
    model_used: result.dossier.model_used,
    updated_at: result.dossier.updated_at,
    used_llm: result.dossier.used_llm,
    stale: false,
  })
}
