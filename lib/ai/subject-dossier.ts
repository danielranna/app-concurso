import { supabaseServer } from "../supabase-server"
import type { SubjectStudyDossierStructured } from "../coach-types"
import { getReportPreferences } from "./context-builder"
import {
  buildSubjectDossierPayload,
  compactDossierPayloadForLlm,
} from "./subject-dossier-payload"
import { runSubjectDossierAgent } from "./agents/subject-dossier"

async function countDossierRunsToday(userId: string): Promise<number> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const { count } = await supabaseServer
    .from("ai_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("agent_type", "dossier")
    .gte("created_at", start.toISOString())
  return count ?? 0
}

export type GenerateSubjectDossierResult =
  | { empty: true; reason: string }
  | {
      empty: false
      dossier: {
        narrative_md: string | null
        structured: SubjectStudyDossierStructured
        source_report_ids: string[]
        model_used: string | null
        updated_at: string
        used_llm: boolean
        stale: boolean
      }
    }

export async function loadSubjectDossier(
  userId: string,
  subjectId: string
): Promise<{
  row: {
    narrative_md: string | null
    structured: SubjectStudyDossierStructured
    source_report_ids: string[]
    model_used: string | null
    updated_at: string
  } | null
  stale: boolean
  latestReportIds: string[]
}> {
  const { data: row } = await supabaseServer
    .from("subject_study_dossier")
    .select(
      "narrative_md, structured, source_report_ids, model_used, updated_at"
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

  if (!row) {
    return { row: null, stale: latestReportIds.length > 0, latestReportIds }
  }

  return {
    row: {
      narrative_md: row.narrative_md,
      structured: row.structured as SubjectStudyDossierStructured,
      source_report_ids: row.source_report_ids ?? [],
      model_used: row.model_used,
      updated_at: row.updated_at,
    },
    stale,
    latestReportIds,
  }
}

export async function generateSubjectDossier(
  userId: string,
  subjectId: string,
  options?: { skipLlm?: boolean; force?: boolean }
): Promise<GenerateSubjectDossierResult> {
  const payload = await buildSubjectDossierPayload(userId, subjectId)
  if (!payload) {
    return {
      empty: true,
      reason:
        "Nenhum relatório com erros explicados nesta matéria. Conclua um caderno com relatório IA.",
    }
  }

  if (!options?.force) {
    const existing = await loadSubjectDossier(userId, subjectId)
    if (existing.row && !existing.stale) {
      return {
        empty: false,
        dossier: {
          ...existing.row,
          used_llm: existing.row.model_used !== "rule-based",
          stale: false,
        },
      }
    }
  }

  const prefs = await getReportPreferences(userId)
  const maxPerDay = Math.max(prefs.max_llm_explanations_per_day, 3)
  const runsToday = await countDossierRunsToday(userId)
  const skipLlm =
    options?.skipLlm || runsToday >= maxPerDay

  const agentResult = await runSubjectDossierAgent({
    userId,
    subjectId,
    payload,
    skipLlm,
  })

  const inputSnapshot = compactDossierPayloadForLlm(payload)
  const now = new Date().toISOString()

  const { error } = await supabaseServer.from("subject_study_dossier").upsert(
    {
      user_id: userId,
      subject_id: subjectId,
      narrative_md: agentResult.narrativeMd,
      structured: agentResult.structured,
      source_report_ids: payload.source_report_ids,
      input_snapshot: inputSnapshot,
      model_used: agentResult.modelUsed,
      tokens_in: agentResult.tokensIn,
      tokens_out: agentResult.tokensOut,
      cost_usd_estimate: agentResult.costUsd,
      updated_at: now,
    },
    { onConflict: "user_id,subject_id" }
  )

  if (error) throw new Error(error.message)

  return {
    empty: false,
    dossier: {
      narrative_md: agentResult.narrativeMd,
      structured: agentResult.structured,
      source_report_ids: payload.source_report_ids,
      model_used: agentResult.modelUsed,
      updated_at: now,
      used_llm: agentResult.usedLlm,
      stale: false,
    },
  }
}
