import { supabaseServer } from "./supabase-server"
import { fetchEditalSubjectRank } from "./edital-subject-rank-db"
import { normLabel, matchScore } from "./incidence-subject-map"

const MIN_WEIGHT = 0.5
const WRONG_BOOST = 0.15

export type IncidenceTopicEntry = {
  topic_name: string
  percent: number
  is_subtopic: boolean
}

export type IncidenceTopicIndex = Map<string, IncidenceTopicEntry>

export type TopicMatchResult = {
  weight: number
  matchedTopic: string | null
  percent: number
}

export function percentToIncidenceWeight(percent: number): number {
  return Math.max(MIN_WEIGHT, Number(percent) / 10)
}

export function computeTopicPriorityScore(params: {
  editalWeight: number
  incidenceWeight: number
  gapScore: number
  retentionPenalty: number
  wrongCount: number
}): number {
  const wrongFactor = 1 + params.wrongCount * WRONG_BOOST
  const raw =
    params.editalWeight *
    params.incidenceWeight *
    params.gapScore *
    params.retentionPenalty *
    wrongFactor
  return Math.round(raw * 1000) / 1000
}

export function formatPriorityReason(params: {
  editalWeight: number
  incidenceWeight: number
  gapScore: number
  retentionPenalty: number
  wrongCount: number
}): string {
  const wrongFactor = 1 + params.wrongCount * WRONG_BOOST
  return `Edital ×${params.editalWeight.toFixed(1)} × Incid. ×${params.incidenceWeight.toFixed(1)} × gap ${params.gapScore.toFixed(2)} × retenção ×${params.retentionPenalty.toFixed(2)} × erros ×${wrongFactor.toFixed(2)}`
}

export function editalWeightFromRankRow(row: {
  percent_of_total?: number
  priority: number
  totalRanked?: number
}): number {
  const pct = row.percent_of_total
  if (pct != null && pct > 0) {
    return Math.max(MIN_WEIGHT, pct / 10)
  }
  const n = row.totalRanked ?? 0
  if (n > 0 && row.priority > 0) {
    return Math.max(MIN_WEIGHT, (n - row.priority + 1) / n)
  }
  return 1
}

export async function getActiveExamTargetId(userId: string): Promise<string | null> {
  const { data } = await supabaseServer
    .from("exam_targets")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle()
  return data?.id ?? null
}

export async function resolveIncidenceWorkbookLabels(
  userId: string,
  examTargetId: string,
  subjectId: string
): Promise<string[]> {
  const { data: wb } = await supabaseServer
    .from("subject_documents")
    .select("parsed_tables")
    .eq("user_id", userId)
    .eq("exam_target_id", examTargetId)
    .eq("doc_type", "incidence")
    .is("subject_id", null)
    .maybeSingle()

  const pt = (wb?.parsed_tables ?? {}) as {
    manual_overrides?: Record<string, string | null>
    subject_mappings?: {
      by_subject?: { subject_id: string; excel_label: string }[]
    }
  }

  const labels: string[] = []
  for (const [excelLabel, sid] of Object.entries(pt.manual_overrides ?? {})) {
    if (sid === subjectId) labels.push(excelLabel)
  }
  for (const row of pt.subject_mappings?.by_subject ?? []) {
    if (row.subject_id === subjectId && !labels.includes(row.excel_label)) {
      labels.push(row.excel_label)
    }
  }
  return labels
}

/** Legado: mapeamento MD estratégico (último fallback). */
export async function resolveMdStrategicLabels(
  userId: string,
  examTargetId: string,
  subjectId: string
): Promise<string[]> {
  const { data: mdDoc } = await supabaseServer
    .from("subject_documents")
    .select("parsed_tables")
    .eq("user_id", userId)
    .eq("exam_target_id", examTargetId)
    .eq("doc_type", "strategic_md")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!mdDoc) return []

  const pt = (mdDoc.parsed_tables ?? {}) as {
    bundle?: { edital_subjects: { slug: string; name: string }[] }
    subject_mappings?: {
      by_slug?: {
        slug: string
        subject_id: string | null
        subject_ids?: string[]
        md_name: string
      }[]
    }
  }

  const labels: string[] = []
  for (const row of pt.subject_mappings?.by_slug ?? []) {
    const ids = row.subject_ids ?? (row.subject_id ? [row.subject_id] : [])
    if (!ids.includes(subjectId)) continue
    const name =
      pt.bundle?.edital_subjects.find((s) => s.slug === row.slug)?.name ??
      row.md_name
    if (name && !labels.includes(name)) labels.push(name)
  }
  return labels
}

/** 1º pareamento Coach→Editais; 2º workbook Excel; 3º MD legado. */
export async function resolveSubjectLabelsForExam(
  userId: string,
  examTargetId: string,
  subjectId: string
): Promise<string[]> {
  const labels: string[] = []

  try {
    const rankRows = await fetchEditalSubjectRank(userId, examTargetId)
    for (const row of rankRows) {
      if (!row.subject_ids.includes(subjectId)) continue
      for (const label of row.incidence_subject_labels) {
        const t = label.trim()
        if (t && !labels.includes(t)) labels.push(t)
      }
    }
  } catch {
    /* tabela pode não existir */
  }

  if (labels.length) return labels

  const workbook = await resolveIncidenceWorkbookLabels(
    userId,
    examTargetId,
    subjectId
  )
  if (workbook.length) return workbook

  return resolveMdStrategicLabels(userId, examTargetId, subjectId)
}

export async function getEditalWeightForSubject(
  userId: string,
  examTargetId: string,
  subjectId: string
): Promise<number> {
  try {
    const rows = await fetchEditalSubjectRank(userId, examTargetId)
    const linked = rows.filter((r) => r.subject_ids.includes(subjectId))
    if (!linked.length) return 1

    const n = rows.length
    let best = MIN_WEIGHT
    for (const row of linked) {
      const w = editalWeightFromRankRow({
        percent_of_total: row.percent_of_total,
        priority: row.priority,
        totalRanked: n,
      })
      if (w > best) best = w
    }
    return best
  } catch {
    return 1
  }
}

export function buildIncidenceTopicIndex(
  rows: { topic_name: string; percent: number; is_subtopic?: boolean }[]
): IncidenceTopicIndex {
  const index: IncidenceTopicIndex = new Map()
  for (const r of rows) {
    const key = r.topic_name.trim()
    if (!key) continue
    const pct = Number(r.percent) || 0
    const existing = index.get(key)
    if (!existing || pct > existing.percent) {
      index.set(key, {
        topic_name: key,
        percent: pct,
        is_subtopic: Boolean(r.is_subtopic),
      })
    }
  }
  return index
}

export function matchTopicToIncidence(
  tecTopic: string,
  index: IncidenceTopicIndex
): TopicMatchResult {
  const topic = tecTopic.trim()
  if (!topic || index.size === 0) {
    return { weight: 1, matchedTopic: null, percent: 0 }
  }

  if (index.has(topic)) {
    const e = index.get(topic)!
    return {
      weight: percentToIncidenceWeight(e.percent),
      matchedTopic: e.topic_name,
      percent: e.percent,
    }
  }

  const normalized = normLabel(topic)
  let bestEntry: IncidenceTopicEntry | null = null
  let bestScore = 0

  for (const [name, entry] of index) {
    const score = matchScore(name, topic)
    if (score > bestScore) {
      bestScore = score
      bestEntry = entry
    } else if (score === bestScore && score >= 40 && bestEntry) {
      if (entry.percent > bestEntry.percent) bestEntry = entry
    }
  }

  if (bestEntry && bestScore >= 40) {
    return {
      weight: percentToIncidenceWeight(bestEntry.percent),
      matchedTopic: bestEntry.topic_name,
      percent: bestEntry.percent,
    }
  }

  for (const [name, entry] of index) {
    const n = normLabel(name)
    if (n === normalized) {
      return {
        weight: percentToIncidenceWeight(entry.percent),
        matchedTopic: entry.topic_name,
        percent: entry.percent,
      }
    }
    if (n.includes(normalized) || normalized.includes(n)) {
      return {
        weight: percentToIncidenceWeight(entry.percent),
        matchedTopic: entry.topic_name,
        percent: entry.percent,
      }
    }
  }

  return { weight: 1, matchedTopic: null, percent: 0 }
}

export function computeErrorPriorityScore(params: {
  wrongCount: number
  incidenceWeight: number
  editalWeight: number
  brainGap: number
  taxonomySeverity: number
}): number {
  return Math.round(
    (params.wrongCount * 10 +
      params.incidenceWeight * 20 +
      params.editalWeight * 15 +
      params.brainGap * 15 +
      params.taxonomySeverity * 5) *
      100
  ) / 100
}
