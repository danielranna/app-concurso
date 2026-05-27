import { supabaseServer } from "../supabase-server"
import { fetchEditalSubjectRank } from "../edital-subject-rank-db"
import { getActiveExamTargetId } from "../strategic-weights"
import { loadMappings } from "../tec-mapping"
import { rankSubjectsByQueue } from "./execution-helpers"

export type QuestionDistributionMode = "fixed_per_subject" | "equal_split"

export type ExecutorStudyPrefs = {
  study_mode: "pre_edital" | "pos_edital" | "reta_final"
  daily_limits: Record<string, number>
  rotate_subjects: boolean
  executor_subject_ids: string[]
  question_distribution_mode: QuestionDistributionMode
  questions_per_subject_round: number
}

export async function getExecutorStudyPreferences(
  userId: string
): Promise<ExecutorStudyPrefs> {
  const { data } = await supabaseServer
    .from("coach_study_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  const rawIds = data?.executor_subject_ids
  const executor_subject_ids = Array.isArray(rawIds)
    ? (rawIds as string[]).filter(Boolean)
    : []

  return {
    study_mode: (data?.study_mode ?? "pre_edital") as ExecutorStudyPrefs["study_mode"],
    daily_limits: (data?.daily_limits ?? {
      questions: 50,
      flashcards: 20,
      summaries: 2,
      error_reviews: 10,
    }) as Record<string, number>,
    rotate_subjects: data?.rotate_subjects ?? true,
    executor_subject_ids,
    question_distribution_mode:
      (data?.question_distribution_mode as QuestionDistributionMode) ??
      "fixed_per_subject",
    questions_per_subject_round: Number(data?.questions_per_subject_round ?? 5),
  }
}

export async function getEditalSubjectIdSet(userId: string): Promise<Set<string>> {
  const examId = await getActiveExamTargetId(userId)
  if (!examId) return new Set()
  try {
    const rows = await fetchEditalSubjectRank(userId, examId)
    const ids = new Set<string>()
    for (const row of rows) {
      for (const sid of row.subject_ids ?? []) {
        if (sid) ids.add(sid)
      }
    }
    return ids
  } catch {
    return new Set()
  }
}

export async function getSubjectIdsWithAttempts(
  userId: string
): Promise<Set<string>> {
  const mappings = await loadMappings(userId)
  const tecToSubject = new Map<string, string>()
  for (const m of mappings) {
    const tec = (m.tec_subject ?? "").trim()
    if (tec && m.subject_id) tecToSubject.set(tec, m.subject_id)
  }

  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select("questions ( tec_subject )")
    .eq("user_id", userId)
    .limit(5000)

  const withAttempts = new Set<string>()
  for (const a of attempts ?? []) {
    const q = a.questions as { tec_subject?: string } | { tec_subject?: string }[] | null
    const qu = Array.isArray(q) ? q[0] : q
    const tec = (qu?.tec_subject ?? "").trim()
    const sid = tecToSubject.get(tec)
    if (sid) withAttempts.add(sid)
  }
  return withAttempts
}

export async function seedExecutorAllowlistIfEmpty(userId: string): Promise<string[]> {
  const prefs = await getExecutorStudyPreferences(userId)
  if (prefs.executor_subject_ids.length) return prefs.executor_subject_ids

  const editalIds = await getEditalSubjectIdSet(userId)
  const attemptedIds = await getSubjectIdsWithAttempts(userId)
  const merged = [...new Set([...editalIds, ...attemptedIds])]

  if (merged.length) {
    const current = await getExecutorStudyPreferences(userId)
    await supabaseServer.from("coach_study_preferences").upsert({
      user_id: userId,
      study_mode: current.study_mode,
      daily_limits: current.daily_limits,
      rotate_subjects: current.rotate_subjects,
      executor_subject_ids: merged,
      question_distribution_mode: current.question_distribution_mode,
      questions_per_subject_round: current.questions_per_subject_round,
      updated_at: new Date().toISOString(),
    })
  }
  return merged
}

export type ExecutorSubjectPool = {
  allowlist: string[]
  eligibleWithAttempts: string[]
  orderedForCycle: string[]
  editalSubjectIds: Set<string>
  subjectNames: Map<string, string>
}

export async function resolveExecutorSubjectPool(
  userId: string,
  queue: {
    subject_id: string
    priority_score: number
    subject_priority?: number
    edital_weight?: number
  }[]
): Promise<ExecutorSubjectPool> {
  const allowlist = await seedExecutorAllowlistIfEmpty(userId)
  const attemptedIds = await getSubjectIdsWithAttempts(userId)
  const editalSubjectIds = await getEditalSubjectIdSet(userId)

  const eligibleWithAttempts = allowlist.filter((id) => attemptedIds.has(id))

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId)

  const subjectNames = new Map((subjects ?? []).map((s) => [s.id, s.name]))

  const orderedForCycle = rankSubjectsByQueue(
    eligibleWithAttempts,
    queue.map((q) => ({
      subject_id: q.subject_id,
      topic_key: "",
      priority_score: q.priority_score,
      subject_priority: q.subject_priority,
      edital_weight: q.edital_weight,
    })),
    []
  )

  return {
    allowlist,
    eligibleWithAttempts,
    orderedForCycle,
    editalSubjectIds,
    subjectNames,
  }
}

export async function mergeEditalIntoAllowlist(userId: string): Promise<string[]> {
  const prefs = await getExecutorStudyPreferences(userId)
  const editalIds = await getEditalSubjectIdSet(userId)
  const merged = [...new Set([...prefs.executor_subject_ids, ...editalIds])]
  const current = await getExecutorStudyPreferences(userId)
  await supabaseServer.from("coach_study_preferences").upsert({
    user_id: userId,
    study_mode: current.study_mode,
    daily_limits: current.daily_limits,
    rotate_subjects: current.rotate_subjects,
    executor_subject_ids: merged,
    question_distribution_mode: current.question_distribution_mode,
    questions_per_subject_round: current.questions_per_subject_round,
    updated_at: new Date().toISOString(),
  })
  return merged
}
