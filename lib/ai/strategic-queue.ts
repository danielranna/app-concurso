import { supabaseServer } from "../supabase-server"
import { loadSubjectBrain } from "./context-builder"
import { getTopicStatsForSubject } from "../learning-signals"
import { buildIncidencePayloadForExam } from "../coach-documents"
import { fetchIncidenceRows, resolveSubjectLabels } from "../incidence-rows-db"
import { normLabel } from "../incidence-subject-map"
import { runStrategyNarrativeAgent } from "./agents/strategy"

type IncidenceTopic = { topic: string; percent: number; quantity?: number }

async function getActiveExamId(userId: string): Promise<string | null> {
  const { data } = await supabaseServer
    .from("exam_targets")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle()
  return data?.id ?? null
}

async function getIncidenceWeights(
  userId: string,
  subjectId: string,
  subjectName: string
): Promise<Map<string, number>> {
  const weights = new Map<string, number>()

  const { data: activeExam } = await supabaseServer
    .from("exam_targets")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle()

  if (activeExam?.id) {
    try {
      const labels = await resolveSubjectLabels(userId, activeExam.id, subjectId)
      if (labels.length) {
        const rows = await fetchIncidenceRows({
          userId,
          examTargetId: activeExam.id,
          subjectLabels: labels,
        })
        for (const r of rows) {
          const key = r.topic_name.trim()
          if (!key) continue
          weights.set(key, Math.max(weights.get(key) ?? 0, Math.max(0.5, Number(r.percent) / 10)))
        }
      }
      const payload = await buildIncidencePayloadForExam(userId, activeExam.id)
      const block = payload.for_llm.find(
        (b) => b.subject_id === subjectId || b.subject_name === subjectName
      )
      if (block?.top_topics) {
        for (const t of block.top_topics as { name?: string; topic?: string; percent?: number }[]) {
          const key = (t.name ?? t.topic ?? "").trim()
          if (!key) continue
          weights.set(key, Math.max(weights.get(key) ?? 0, Math.max(0.5, (t.percent ?? 10) / 10)))
        }
      }
    } catch {
      /* no incidence */
    }
  }

  const { data: incidenceDocs } = await supabaseServer
    .from("subject_documents")
    .select("parsed_tables")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .eq("doc_type", "incidence")
    .eq("status", "ready")
    .limit(1)

  const pt = (incidenceDocs?.[0]?.parsed_tables ?? {}) as Record<string, unknown>
  const groups = (pt.groups as { name: string; percent: number }[]) ?? []
  for (const g of groups) {
    const key = (g.name ?? "").trim()
    if (key) weights.set(key, Math.max(weights.get(key) ?? 0, (g.percent ?? 5) / 10))
  }

  return weights
}

export async function recomputeStrategicQueue(
  userId: string,
  subjectId: string,
  options?: { withLlmNarrative?: boolean }
) {
  const { data: subject } = await supabaseServer
    .from("subjects")
    .select("name")
    .eq("id", subjectId)
    .single()

  const topicStats = await getTopicStatsForSubject(userId, subjectId)
  const brain = await loadSubjectBrain(userId, subjectId)
  const incidence = await getIncidenceWeights(
    userId,
    subjectId,
    subject?.name ?? ""
  )

  const examId = await getActiveExamId(userId)
  const labels = examId
    ? await resolveSubjectLabels(userId, examId, subjectId).catch(() => [] as string[])
    : []

  const incidenceRows =
    examId && labels.length
      ? await fetchIncidenceRows({
          userId,
          examTargetId: examId,
          subjectLabels: labels,
        })
      : []

  const topicKeys = new Map<
    string,
    { wrong: number; correct: number; fromIncidence: boolean }
  >()

  for (const t of topicStats) {
    topicKeys.set(t.topic, {
      wrong: t.wrong,
      correct: t.correct,
      fromIncidence: false,
    })
  }

  for (const r of incidenceRows) {
    const key = r.topic_name.trim()
    if (!key) continue
    const existing = topicKeys.get(key)
    if (existing) {
      existing.fromIncidence = true
    } else {
      topicKeys.set(key, { wrong: 0, correct: 0, fromIncidence: true })
    }
    if (!incidence.has(key)) {
      incidence.set(key, Math.max(0.5, Number(r.percent) / 10))
    }
  }

  const rows: {
    user_id: string
    subject_id: string
    topic_key: string
    priority_score: number
    incidence_weight: number
    gap_score: number
    retention_penalty: number
    reason: string
    source: string
    computed_at: string
  }[] = []

  for (const [topic, t] of topicKeys) {
    const dominio = t.correct + t.wrong > 0 ? t.correct / (t.correct + t.wrong) : 0.5
    const brainEntry =
      brain?.topic_map?.[topic] ??
      Object.entries(brain?.topic_map ?? {}).find(
        ([k]) => normLabel(k) === normLabel(topic)
      )?.[1]
    const gap_score = brainEntry ? 1 - brainEntry.dominio : 1 - dominio
    const estabilidade = brainEntry?.estabilidade ?? 0.5
    const retention_penalty =
      estabilidade < 0.4 ? 1.4 : estabilidade < 0.6 ? 1.15 : 1
    const incidence_weight = incidence.get(topic) ?? 1

    const priority_score =
      incidence_weight * gap_score * retention_penalty * (1 + t.wrong * 0.1)

    if (priority_score < 0.15 && dominio > 0.85) continue

    rows.push({
      user_id: userId,
      subject_id: subjectId,
      topic_key: topic,
      priority_score: Math.round(priority_score * 1000) / 1000,
      incidence_weight,
      gap_score: Math.round(gap_score * 100) / 100,
      retention_penalty,
      reason: `Incidência ${incidence_weight.toFixed(1)} × gap ${gap_score.toFixed(2)} × retenção ×${retention_penalty.toFixed(2)}`,
      source: "sql",
      computed_at: new Date().toISOString(),
    })
  }

  rows.sort((a, b) => b.priority_score - a.priority_score)

  await supabaseServer
    .from("strategic_queue_items")
    .delete()
    .eq("user_id", userId)
    .eq("subject_id", subjectId)

  if (rows.length) {
    const { error } = await supabaseServer
      .from("strategic_queue_items")
      .insert(rows.slice(0, 40))
    if (error) throw new Error(error.message)
  }

  if (options?.withLlmNarrative && rows.length) {
    const narrative = await runStrategyNarrativeAgent({
      userId,
      subjectId,
      queue: rows.slice(0, 10),
    })
    for (const [topic_key, why] of Object.entries(narrative.whys)) {
      await supabaseServer
        .from("strategic_queue_items")
        .update({ reason: why, source: "llm" })
        .eq("user_id", userId)
        .eq("subject_id", subjectId)
        .eq("topic_key", topic_key)
    }
  }

  return rows
}

export async function recomputeAllSubjectsQueue(userId: string) {
  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id")
    .eq("user_id", userId)

  const all = []
  for (const s of subjects ?? []) {
    const rows = await recomputeStrategicQueue(userId, s.id)
    all.push(...rows)
  }
  return all
}

export async function syncEditalWeightsToQueue(
  userId: string,
  examTargetId: string
) {
  const { data: exam } = await supabaseServer
    .from("exam_targets")
    .select("id")
    .eq("user_id", userId)
    .eq("id", examTargetId)
    .single()

  if (!exam) return

  const { data: latestPlan } = await supabaseServer
    .from("exam_target_reports")
    .select("structured")
    .eq("exam_target_id", examTargetId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const matrix =
    (latestPlan?.structured as { topic_matrix?: { subject?: string; topic?: string }[] })
      ?.topic_matrix ?? []

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)

  const subjectByName = new Map(
    (subjects ?? []).map((s) => [s.name.toLowerCase(), s.id])
  )

  for (const row of matrix) {
    const subName = (row.subject ?? "").trim().toLowerCase()
    const topic = (row.topic ?? "").trim()
    if (!subName || !topic) continue
    const subjectId = subjectByName.get(subName)
    if (!subjectId) continue

    const { data: existing } = await supabaseServer
      .from("strategic_queue_items")
      .select("priority_score, incidence_weight")
      .eq("user_id", userId)
      .eq("subject_id", subjectId)
      .eq("topic_key", topic)
      .maybeSingle()

    const boost = 1.25
    if (existing) {
      await supabaseServer
        .from("strategic_queue_items")
        .update({
          incidence_weight: Math.max(existing.incidence_weight ?? 1, boost),
          priority_score: (existing.priority_score ?? 0) * 1.1,
          reason: "Reforço pós-plano de edital",
        })
        .eq("user_id", userId)
        .eq("subject_id", subjectId)
        .eq("topic_key", topic)
    }
  }

  await recomputeAllSubjectsQueue(userId)
}
