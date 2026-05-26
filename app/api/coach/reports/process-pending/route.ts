import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { enqueueNotebookReport } from "@/lib/ai/notebook-report"
import { runJobWorker } from "@/lib/ai/jobs/worker"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const user_id = body.user_id as string | undefined

  if (!user_id) {
    return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 })
  }

  try {
    const { data: pendingNotebooks, error: listErr } = await supabaseServer
      .from("notebooks")
      .select("id, name, completed_at, report_pending")
      .eq("user_id", user_id)
      .eq("report_pending", true)

    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 })
    }

    let notebooks = pendingNotebooks ?? []

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
    const enqueueResults: {
      notebook_id: string
      name: string
      queued?: boolean
      skipped?: boolean
      reason?: string
      report_id?: string
    }[] = []

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
      const batch = await runJobWorker(10)
      jobResults.push(...batch)
      if (batch.length === 0) break
      const onlySkips = batch.every(
        (j) => j.status === "done" || j.status === "failed"
      )
      if (!onlySkips && batch.length < 10) break
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

    const generated = enqueueResults.filter((r) => !r.skipped || r.report_id)
    const latestReportId = recentReports?.[0]?.id ?? null

    return NextResponse.json({
      ok: true,
      notebooks_found: notebooks.length,
      enqueue_results: enqueueResults,
      jobs_processed: jobResults.length,
      still_pending: stillPending ?? 0,
      latest_report_id: latestReportId,
      recent_reports: recentReports ?? [],
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao gerar relatórios"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
