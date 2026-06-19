import { supabaseServer } from "../supabase-server"
import type { CanvasDocument } from "../canvas-blocks/types"
import { applyCanvasPatches } from "../canvas-blocks/patch"
import type { NotebookReportStructured } from "../coach-types"
import {
  dossierStructuredToCanvas,
  emptyErrorNotebook,
  reportToCanvasPatches,
} from "./error-notebook-canvas"
import { loadSubjectDossier } from "./subject-dossier"
import { runErrorNotebookCanvasAgent } from "./agents/error-notebook-canvas"

export async function loadAiErrorNotebook(userId: string, subjectId: string) {
  const { data: row } = await supabaseServer
    .from("subject_ai_error_notebooks")
    .select(
      "document, source_report_ids, last_report_id, model_used, updated_at"
    )
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .maybeSingle()

  const { data: reports } = await supabaseServer
    .from("subject_notebook_reports")
    .select("id")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })

  const latestReportIds = (reports ?? []).map((r) => r.id)
  const storedIds = new Set(row?.source_report_ids ?? [])
  const stale = latestReportIds.some((id) => !storedIds.has(id))

  return { row, stale, latestReportIds }
}

export async function getOrMigrateErrorNotebook(
  userId: string,
  subjectId: string,
  subjectName: string
): Promise<CanvasDocument> {
  const { row } = await loadAiErrorNotebook(userId, subjectId)
  if (row?.document) {
    return row.document as CanvasDocument
  }

  const dossier = await loadSubjectDossier(userId, subjectId)
  if (dossier.row?.structured) {
    return dossierStructuredToCanvas(dossier.row.structured, subjectName)
  }

  return emptyErrorNotebook(subjectName)
}

export async function ingestErrorNotebookFromReport(params: {
  userId: string
  subjectId: string
  subjectName: string
  reportId: string
  skipLlm?: boolean
}) {
  const { data: reportRow } = await supabaseServer
    .from("subject_notebook_reports")
    .select("structured")
    .eq("id", params.reportId)
    .eq("user_id", params.userId)
    .maybeSingle()

  const structured = reportRow?.structured as NotebookReportStructured | null
  if (!structured) {
    return { ok: false, reason: "Relatório não encontrado" }
  }

  let document = await getOrMigrateErrorNotebook(
    params.userId,
    params.subjectId,
    params.subjectName
  )

  const rulePatches = reportToCanvasPatches(structured, params.reportId)
  document = applyCanvasPatches(document, rulePatches)

  if (!params.skipLlm) {
    const agentResult = await runErrorNotebookCanvasAgent({
      userId: params.userId,
      subjectId: params.subjectId,
      currentDocument: document,
      reportStructured: structured,
    })
    if (agentResult.patches.length > 0) {
      document = applyCanvasPatches(document, agentResult.patches)
    }
  }

  const { data: existing } = await supabaseServer
    .from("subject_ai_error_notebooks")
    .select("source_report_ids")
    .eq("user_id", params.userId)
    .eq("subject_id", params.subjectId)
    .maybeSingle()

  const sourceIds = new Set(existing?.source_report_ids ?? [])
  sourceIds.add(params.reportId)

  const { error } = await supabaseServer.from("subject_ai_error_notebooks").upsert(
    {
      user_id: params.userId,
      subject_id: params.subjectId,
      document,
      source_report_ids: [...sourceIds],
      last_report_id: params.reportId,
      model_used: params.skipLlm ? "rule_based" : "gpt-4o-mini",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,subject_id" }
  )

  if (error) throw new Error(error.message)
  return { ok: true, document }
}
