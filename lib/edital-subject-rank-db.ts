import { supabaseServer } from "./supabase-server"
import { normLabel } from "./incidence-subject-map"
import type { EditalSubjectRankRow } from "./coach-types"

export type EditalSubjectRankDbRow = EditalSubjectRankRow & {
  id: string
  incidence_subject_label?: string | null
  subject_id?: string | null
}

export async function persistEditalSubjectRank(
  userId: string,
  examTargetId: string,
  rows: EditalSubjectRankRow[],
  suggestedIncidence: Record<string, string> = {}
) {
  let existing: EditalSubjectRankDbRow[] = []
  try {
    existing = await fetchEditalSubjectRank(userId, examTargetId)
  } catch {
    /* tabela pode não existir ainda */
  }

  const savedLinks = new Map<
    string,
    { incidence_subject_label?: string | null; subject_id?: string | null }
  >()
  for (const row of existing) {
    savedLinks.set(normLabel(row.subject_name), {
      incidence_subject_label: row.incidence_subject_label ?? null,
      subject_id: row.subject_id ?? null,
    })
  }

  await supabaseServer
    .from("exam_edital_subject_rank")
    .delete()
    .eq("exam_target_id", examTargetId)
    .eq("user_id", userId)

  if (!rows.length) return

  const payload = rows.map((r) => {
    const key = normLabel(r.subject_name)
    const prev = savedLinks.get(key)
    const suggested = suggestedIncidence[r.subject_name]
    return {
      user_id: userId,
      exam_target_id: examTargetId,
      edital_subject_name: r.subject_name,
      priority: r.priority,
      edital_weight: r.edital_weight ?? null,
      question_count: r.question_count ?? null,
      percent_of_total: r.percent_of_total ?? null,
      prova: r.prova ?? null,
      tiebreaker_note: r.tiebreaker_note ?? null,
      impact_on_final_score: r.impact_on_final_score ?? null,
      incidence_summary: r.incidence_summary ?? null,
      why: r.why ?? null,
      incidence_subject_label:
        prev?.incidence_subject_label ??
        (suggested || null),
      subject_id: prev?.subject_id ?? null,
      updated_at: new Date().toISOString(),
    }
  })

  const { error } = await supabaseServer
    .from("exam_edital_subject_rank")
    .insert(payload)

  if (error) throw new Error(error.message)
}

export async function fetchEditalSubjectRank(
  userId: string,
  examTargetId: string
): Promise<EditalSubjectRankDbRow[]> {
  const { data, error } = await supabaseServer
    .from("exam_edital_subject_rank")
    .select("*")
    .eq("user_id", userId)
    .eq("exam_target_id", examTargetId)
    .order("priority", { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    subject_name: row.edital_subject_name,
    priority: row.priority,
    edital_weight: row.edital_weight ?? undefined,
    question_count: row.question_count ?? undefined,
    percent_of_total:
      row.percent_of_total != null ? Number(row.percent_of_total) : undefined,
    prova: row.prova ?? undefined,
    tiebreaker_note: row.tiebreaker_note ?? undefined,
    impact_on_final_score: row.impact_on_final_score ?? undefined,
    incidence_summary: row.incidence_summary ?? undefined,
    why: row.why ?? undefined,
    incidence_subject_label: row.incidence_subject_label ?? undefined,
    subject_id: row.subject_id ?? undefined,
  }))
}

export async function updateEditalSubjectRankMapping(
  userId: string,
  rankId: string,
  patch: {
    incidence_subject_label?: string | null
    subject_id?: string | null
  }
) {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (patch.incidence_subject_label !== undefined) {
    updates.incidence_subject_label = patch.incidence_subject_label
  }
  if (patch.subject_id !== undefined) {
    updates.subject_id = patch.subject_id
  }

  const { data, error } = await supabaseServer
    .from("exam_edital_subject_rank")
    .update(updates)
    .eq("id", rankId)
    .eq("user_id", userId)
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function listIncidenceLabelsForExam(
  userId: string,
  examTargetId: string
): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("incidence_rows")
    .select("subject_label")
    .eq("user_id", userId)
    .eq("exam_target_id", examTargetId)

  if (error) throw new Error(error.message)
  const labels = new Set<string>()
  for (const row of data ?? []) {
    if (row.subject_label) labels.add(row.subject_label)
  }
  return [...labels].sort((a, b) => a.localeCompare(b, "pt-BR"))
}
