import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { enqueueNotebookReport } from "@/lib/ai/notebook-report"
import { runJobWorker } from "@/lib/ai/jobs/worker"
import type { JobType } from "@/lib/ai/jobs/queue"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const user_id = body.user_id as string | undefined
  const notebook_id = body.notebook_id as string | undefined

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    let notebooks: {
      id: string
      name: string
      completed_at: string | null
      report_pending?: boolean
    }[] = []

    if (notebook_id) {
      const { data: chosen, error: chosenErr } = await supabaseServer
        .from("notebooks")
        .select("id, name, completed_at, report_pending")
        .eq("id", notebook_id)
        .eq("user_id", user_id)
        .maybeSingle()
      if (chosenErr) {
        return NextResponse.json({ error: chosenErr.message }, { status: 500 })
      }
      if (!chosen) {
        return NextResponse.json({ error: "Caderno não encontrado" }, { status: 404 })
      }
      notebooks = [chosen]
    } else {
      const { data: pendingNotebooks, error: listErr } = await supabaseServer
        .from("notebooks")
        .select("id, name, completed_at, report_pending")
        .eq("user_id", user_id)
        .eq("report_pending", true)

      if (listErr) {
        return NextResponse.json({ error: listErr.message }, { status: 500 })
      }

      notebooks = pendingNotebooks ?? []

      if (notebooks.length === 0) {
        const { data: completed } = await supabaseServer
          .from("notebooks")
          .select("id, name, completed_at, report_pending")
          .eq("user_id", user_id)
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false })
          .limit(20)

        const ids = (completed ?? []).map((n) => n.id)
        if (ids.length) {
          const { data: existingReports } = await supabaseServer
            .from("subject_notebook_reports")
            .select("notebook_id")
            .in("notebook_id", ids)

          const hasReport = new Set((existingReports ?? []).map((r) => r.notebook_id))
          notebooks = (completed ?? []).filter((n) => !hasReport.has(n.id))
        }
      }
    }

    const enqueueResults: {
      notebook_id: string
      name: string
      queued?: boolean
      skipped?: boolean
      reason?: string
      report_id?: string
    }[] = []
    const reportPipelineTypes: JobType[] = [
      "notebook_report_aggregate",
      "classify_wrong_attempts",
      "brain_ingest_report",
      "strategy_recompute",
      "strategy_recompute_all",
      "execution_plan_today",
    ]

    for (const nb of notebooks) {
      if (!nb.completed_at) {
        enqueueResults.push({
          notebook_id: nb.id,
          name: nb.name,
          skipped: true,
          reason: "not_completed",
        })
        continue
      }
      const result = await enqueueNotebookReport(nb.id, user_id, { force: false })
      enqueueResults.push({
        notebook_id: nb.id,
        name: nb.name,
        ...result,
      })
    }

    const jobResults: { id: string; status: string; error?: string }[] = []
    for (let round = 0; round < 8; round++) {
      const batch = await runJobWorker(10, {
        userId: user_id,
        jobTypes: reportPipelineTypes,
      })
      jobResults.push(...batch)
      if (batch.length === 0) break
      const onlySkips = batch.every(
        (j) => j.status === "done" || j.status === "failed"
      )
      if (!onlySkips && batch.length < 10) break
    }

    // Auto-heal: if report already exists, clear stale report_pending.
    const notebookIds = notebooks.map((n) => n.id)
    if (notebookIds.length) {
      const { data: existingReports } = await supabaseServer
        .from("subject_notebook_reports")
        .select("notebook_id")
        .eq("user_id", user_id)
        .in("notebook_id", notebookIds)
      const reportedIds = [...new Set((existingReports ?? []).map((r) => r.notebook_id))]
      if (reportedIds.length) {
        await supabaseServer
          .from("notebooks")
          .update({ report_pending: false })
          .eq("user_id", user_id)
          .in("id", reportedIds)
      }
    }

    const { data: recentReports } = await supabaseServer
      .from("subject_notebook_reports")
      .select("id, notebook_id, created_at")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(5)

    const { count: stillPending } = await supabaseServer
      .from("notebooks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("report_pending", true)

    let latestReportId = recentReports?.[0]?.id ?? null
    if (notebook_id) {
      const { data: chosenReport } = await supabaseServer
        .from("subject_notebook_reports")
        .select("id, created_at")
        .eq("user_id", user_id)
        .eq("notebook_id", notebook_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      latestReportId = chosenReport?.id ?? latestReportId
    }

    return NextResponse.json({
      ok: true,
      notebooks_found: notebooks.length,
      enqueue_results: enqueueResults,
      jobs_processed: jobResults.length,
      still_pending: stillPending ?? 0,
      latest_report_id: latestReportId,
      recent_reports: recentReports ?? [],
      notebook_id: notebook_id ?? null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao gerar relatórios"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
