import { supabaseServer } from "./supabase-server"
import type { LearningSignal, LearningSignalType } from "./coach-types"
import { loadMappings } from "./tec-mapping"

const MIN_WRONG_FOR_RECURRENCE = 3
const CONSOLIDATED_SOLID_COUNT = 3

type QuestionMeta = {
  tec_id: number
  tec_subject: string
  tec_topic: string
}

type AttemptRow = {
  question_id: string
  is_correct: boolean
  duration_ms: number | null
  confidence_level: string | null
  outcome_category: string | null
  created_at: string
  questions: QuestionMeta | null
}

function unwrapQ(
  q: QuestionMeta | QuestionMeta[] | null | undefined
): QuestionMeta | null {
  if (!q) return null
  return Array.isArray(q) ? q[0] ?? null : q
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

async function fetchAttemptsForSubject(userId: string, subjectId: string) {
  const mappings = await loadMappings(userId)
  const subjectMappings = mappings.filter((m) => m.subject_id === subjectId)
  if (!subjectMappings.length) return []

  const tecSubjects = new Set(
    subjectMappings.map((m) => (m.tec_subject ?? "").trim()).filter(Boolean)
  )

  const { data: questions } = await supabaseServer
    .from("questions")
    .select("id, tec_id, tec_subject, tec_topic")
    .in("tec_subject", [...tecSubjects])

  const questionIds = (questions ?? []).map((q) => q.id)
  if (!questionIds.length) return []

  const { data: attempts } = await supabaseServer
    .from("question_attempts")
    .select(
      `
      question_id, is_correct, duration_ms, confidence_level,
      outcome_category, created_at,
      questions ( tec_id, tec_subject, tec_topic )
    `
    )
    .eq("user_id", userId)
    .in("question_id", questionIds)
    .order("created_at", { ascending: true })

  return (attempts ?? []).map((a) => ({
    ...a,
    questions: unwrapQ(a.questions as QuestionMeta | QuestionMeta[] | null),
  }))
}

export function computeSignalsFromAttempts(
  attempts: AttemptRow[],
  subjectId: string | null
): LearningSignal[] {
  const signals: LearningSignal[] = []
  const byQuestion = new Map<string, AttemptRow[]>()
  const byTopic = new Map<string, AttemptRow[]>()

  for (const a of attempts) {
    const qList = byQuestion.get(a.question_id) ?? []
    qList.push(a)
    byQuestion.set(a.question_id, qList)

    const q = a.questions
    const topic = q?.tec_topic?.trim() || "Sem tópico"
    const tList = byTopic.get(topic) ?? []
    tList.push(a)
    byTopic.set(topic, tList)
  }

  const allDurations = attempts
    .map((a) => a.duration_ms)
    .filter((d): d is number => d != null && d > 0)
  const p75 =
    allDurations.length > 0
      ? [...allDurations].sort((a, b) => a - b)[
          Math.floor(allDurations.length * 0.75)
        ] ?? 60000
      : 60000

  for (const [questionId, rows] of byQuestion) {
    const wrongCount = rows.filter((r) => !r.is_correct).length
    const solidCount = rows.filter(
      (r) => r.outcome_category === "conhecimento_solido"
    ).length
    const q = rows[0]?.questions

    if (wrongCount >= MIN_WRONG_FOR_RECURRENCE) {
      signals.push({
        signal_type: "high_recurrence",
        entity_type: "question",
        entity_id: questionId,
        score: wrongCount * 10,
        metadata: {
          wrong_count: wrongCount,
          tec_id: q?.tec_id,
          tec_topic: q?.tec_topic,
          subject_id: subjectId,
        },
      })
    }

    if (solidCount >= CONSOLIDATED_SOLID_COUNT) {
      signals.push({
        signal_type: "consolidated",
        entity_type: "question",
        entity_id: questionId,
        score: solidCount,
        metadata: { tec_id: q?.tec_id, tec_topic: q?.tec_topic },
      })
    }

    const slowWrong = rows.filter(
      (r) =>
        !r.is_correct &&
        (r.duration_ms ?? 0) > p75 &&
        (r.confidence_level === "inseguro" || r.outcome_category === "lacuna_consciente")
    )
    if (slowWrong.length >= 2) {
      signals.push({
        signal_type: "slow_struggle",
        entity_type: "question",
        entity_id: questionId,
        score: slowWrong.length * 8,
        metadata: { attempts: slowWrong.length },
      })
    }

    const fastGuessWrong = rows.filter(
      (r) =>
        !r.is_correct &&
        (r.duration_ms ?? 999999) < 30000 &&
        (r.confidence_level === "chute" || r.outcome_category === "conteudo_desconhecido")
    )
    if (fastGuessWrong.length >= 1) {
      signals.push({
        signal_type: "fast_guess_wrong",
        entity_type: "question",
        entity_id: questionId,
        score: 15,
        metadata: {},
      })
    }

    if (rows.length >= 2) {
      const first = rows[0]!
      const last = rows[rows.length - 1]!
      if (
        !first.is_correct &&
        last.is_correct &&
        (last.duration_ms ?? 0) < (first.duration_ms ?? 999999)
      ) {
        signals.push({
          signal_type: "time_improving",
          entity_type: "question",
          entity_id: questionId,
          score: 5,
          metadata: {},
        })
      }
    }
  }

  for (const [topic, rows] of byTopic) {
    const falsePos = rows.filter((r) => r.outcome_category === "falso_positivo")
    if (falsePos.length >= 2) {
      signals.push({
        signal_type: "false_positive_pattern",
        entity_type: "tec_topic",
        entity_id: topic,
        score: falsePos.length * 7,
        metadata: { count: falsePos.length },
      })
    }
  }

  return signals.sort((a, b) => b.score - a.score)
}

export async function computeLearningSignals(
  userId: string,
  subjectId?: string | null
): Promise<LearningSignal[]> {
  if (subjectId) {
    const attempts = await fetchAttemptsForSubject(userId, subjectId)
    return computeSignalsFromAttempts(attempts, subjectId)
  }

  const { data: subjects } = await supabaseServer
    .from("subjects")
    .select("id")
    .eq("user_id", userId)

  const all: LearningSignal[] = []
  for (const s of subjects ?? []) {
    const attempts = await fetchAttemptsForSubject(userId, s.id)
    all.push(...computeSignalsFromAttempts(attempts, s.id))
  }
  return all.sort((a, b) => b.score - a.score)
}

export async function persistLearningSignals(
  userId: string,
  subjectId: string,
  signals: LearningSignal[]
) {
  await supabaseServer
    .from("learning_signals")
    .delete()
    .eq("user_id", userId)
    .eq("subject_id", subjectId)

  if (!signals.length) return

  const rows = signals.map((s) => ({
    user_id: userId,
    subject_id: subjectId,
    signal_type: s.signal_type,
    entity_type: s.entity_type,
    entity_id: s.entity_id,
    score: s.score,
    metadata: s.metadata,
    computed_at: new Date().toISOString(),
  }))

  const { error } = await supabaseServer.from("learning_signals").insert(rows)
  if (error) throw new Error(error.message)
}

export async function getTopicStatsForSubject(
  userId: string,
  subjectId: string
) {
  const attempts = await fetchAttemptsForSubject(userId, subjectId)
  const byTopic = new Map<
    string,
    { correct: number; wrong: number; durations: number[] }
  >()

  for (const a of attempts) {
    const topic = a.questions?.tec_topic?.trim() || "Sem tópico"
    const g = byTopic.get(topic) ?? { correct: 0, wrong: 0, durations: [] }
    if (a.is_correct) g.correct++
    else g.wrong++
    if (a.duration_ms) g.durations.push(a.duration_ms)
    byTopic.set(topic, g)
  }

  return [...byTopic.entries()].map(([topic, g]) => ({
    topic,
    correct: g.correct,
    wrong: g.wrong,
    avg_duration_ms: g.durations.length
      ? Math.round(g.durations.reduce((s, d) => s + d, 0) / g.durations.length)
      : 0,
    median_duration_ms: Math.round(median(g.durations)),
  }))
}
