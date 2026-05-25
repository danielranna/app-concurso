import { supabaseServer } from "./supabase-server"
import { getExamIncidenceHierarchy } from "./coach-documents"
import { normLabel } from "./incidence-subject-map"
import type { EditalSubjectRankRow } from "./coach-types"

export type EditalSubjectRankDbRow = EditalSubjectRankRow & {
  id: string
  incidence_subject_labels: string[]
  subject_ids: string[]
  /** @deprecated primeiro vínculo — compat */
  incidence_subject_label?: string | null
  subject_id?: string | null
}

function parseStringArray(val: unknown): string[] {
  if (!val) return []
  if (Array.isArray(val)) {
    return val.map((x) => String(x).trim()).filter(Boolean)
  }
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x).trim()).filter(Boolean)
      }
    } catch {
      return val.trim() ? [val.trim()] : []
    }
  }
  return []
}

function uniqueLabels(items: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = normLabel(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item.trim())
  }
  return out
}

function uniqueIds(items: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const id = item.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function rowFromDb(row: Record<string, unknown>): EditalSubjectRankDbRow {
  let labels = parseStringArray(row.incidence_subject_labels)
  let subjectIds = parseStringArray(row.subject_ids)
  const legacyLabel = row.incidence_subject_label as string | null | undefined
  const legacySubjectId = row.subject_id as string | null | undefined
  if (!labels.length && legacyLabel) labels = [legacyLabel]
  if (!subjectIds.length && legacySubjectId) subjectIds = [String(legacySubjectId)]
  labels = uniqueLabels(labels)
  subjectIds = uniqueIds(subjectIds)

  return {
    id: String(row.id),
    subject_name: String(row.edital_subject_name),
    priority: Number(row.priority),
    edital_weight: (row.edital_weight as string) ?? undefined,
    question_count:
      row.question_count != null ? Number(row.question_count) : undefined,
    percent_of_total:
      row.percent_of_total != null ? Number(row.percent_of_total) : undefined,
    prova: (row.prova as string) ?? undefined,
    tiebreaker_note: (row.tiebreaker_note as string) ?? undefined,
    impact_on_final_score: (row.impact_on_final_score as string) ?? undefined,
    incidence_summary: (row.incidence_summary as string) ?? undefined,
    why: (row.why as string) ?? undefined,
    percent_calculation: (row.percent_calculation as string) ?? undefined,
    incidence_subject_labels: labels,
    subject_ids: subjectIds,
    incidence_subject_label: labels[0] ?? null,
    subject_id: subjectIds[0] ?? null,
  }
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
    { incidence_subject_labels: string[]; subject_ids: string[] }
  >()
  for (const row of existing) {
    savedLinks.set(normLabel(row.subject_name), {
      incidence_subject_labels: row.incidence_subject_labels ?? [],
      subject_ids: row.subject_ids ?? [],
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
    const prevRow = existing.find((e) => normLabel(e.subject_name) === key)
    const suggested = suggestedIncidence[r.subject_name]
    const labels = uniqueLabels([
      ...(prev?.incidence_subject_labels ?? []),
      ...(suggested ? [suggested] : []),
    ])
    const subjectIds = uniqueIds(prev?.subject_ids ?? [])

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
      percent_calculation:
        r.percent_calculation ?? prevRow?.percent_calculation ?? null,
      incidence_subject_label: labels[0] ?? null,
      subject_id: subjectIds[0] ?? null,
      incidence_subject_labels: labels,
      subject_ids: subjectIds,
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

  return (data ?? []).map((row) => rowFromDb(row as Record<string, unknown>))
}

export async function updateEditalSubjectRankMapping(
  userId: string,
  rankId: string,
  patch: {
    incidence_subject_labels?: string[]
    subject_ids?: string[]
  }
) {
  const { data: current, error: readErr } = await supabaseServer
    .from("exam_edital_subject_rank")
    .select("*")
    .eq("id", rankId)
    .eq("user_id", userId)
    .single()

  if (readErr || !current) {
    throw new Error(readErr?.message ?? "Linha do ranking não encontrada")
  }

  const cur = rowFromDb(current as Record<string, unknown>)
  const labels =
    patch.incidence_subject_labels !== undefined
      ? uniqueLabels(patch.incidence_subject_labels)
      : cur.incidence_subject_labels
  const ids =
    patch.subject_ids !== undefined
      ? uniqueIds(patch.subject_ids)
      : cur.subject_ids

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    incidence_subject_labels: labels,
    incidence_subject_label: labels[0] ?? null,
    subject_ids: ids,
    subject_id: ids[0] ?? null,
  }

  const { data, error } = await supabaseServer
    .from("exam_edital_subject_rank")
    .update(updates)
    .eq("id", rankId)
    .eq("user_id", userId)
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return rowFromDb(data as Record<string, unknown>)
}

/** Matérias do mapa de incidência (Excel importado) — mesma lista do painel hierárquico. */
export async function listIncidenceLabelsFromWorkbook(
  userId: string,
  examTargetId: string
): Promise<string[]> {
  const hierarchy = await getExamIncidenceHierarchy(userId, examTargetId)
  if (hierarchy?.subjects?.length) {
    return hierarchy.subjects
      .map((s) => s.label)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
  }

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

/** @deprecated use listIncidenceLabelsFromWorkbook */
export async function listIncidenceLabelsForExam(
  userId: string,
  examTargetId: string
) {
  return listIncidenceLabelsFromWorkbook(userId, examTargetId)
}
