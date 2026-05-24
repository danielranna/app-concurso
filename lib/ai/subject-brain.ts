import { supabaseServer } from "../supabase-server"
import type {
  ErrorTaxonomy,
  SubjectBrainState,
  TopicBrainEntry,
} from "../coach-types"
import { buildBrainContext } from "./context-builder"
import { runBrainNarrativeAgent } from "./agents/brain"
import { getTopicStatsForSubject } from "../learning-signals"

function dominioFromStats(correct: number, wrong: number): number {
  const total = correct + wrong
  if (total === 0) return 0.5
  return correct / total
}

function estabilidadeFromAttempts(
  rows: { is_correct: boolean }[]
): number {
  if (rows.length < 2) return 0.3
  let flips = 0
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.is_correct !== rows[i - 1]!.is_correct) flips++
  }
  return Math.max(0, 1 - flips / (rows.length - 1))
}

function statusFromMetrics(
  dominio: number,
  estabilidade: number,
  wrong: number
): TopicBrainEntry["status"] {
  if (dominio >= 0.85 && estabilidade >= 0.7) return "dominado"
  if (dominio >= 0.7 && estabilidade >= 0.5) return "forte"
  if (dominio >= 0.55 && estabilidade < 0.45) return "instavel"
  if (dominio < 0.45 && wrong >= 3) return "critico"
  if (dominio >= 0.6 && estabilidade < 0.35) return "ilusao_dominio"
  if (dominio < 0.55) return "fraco"
  return "em_evolucao"
}

export async function computeSubjectBrainState(
  userId: string,
  subjectId: string,
  reportId?: string
): Promise<SubjectBrainState> {
  const topicStats = await getTopicStatsForSubject(userId, subjectId)

  const { data: taxonomyRows } = await supabaseServer
    .from("question_attempts")
    .select(
      `
      error_taxonomy, is_correct,
      questions!inner ( tec_topic, tec_subject )
    `
    )
    .eq("user_id", userId)
    .not("error_taxonomy", "is", null)
    .eq("is_correct", false)
    .limit(500)

  const errorByTopic = new Map<string, Map<string, number>>()
  for (const row of taxonomyRows ?? []) {
    const q = row.questions as { tec_topic?: string } | { tec_topic?: string }[]
    const topic = (Array.isArray(q) ? q[0]?.tec_topic : q?.tec_topic)?.trim() || "Sem tópico"
    const tax = row.error_taxonomy as string
    const m = errorByTopic.get(topic) ?? new Map()
    m.set(tax, (m.get(tax) ?? 0) + 1)
    errorByTopic.set(topic, m)
  }

  const topic_map: Record<string, TopicBrainEntry> = {}
  const danger_topics: string[] = []

  for (const t of topicStats) {
    const dominio = dominioFromStats(t.correct, t.wrong)
    const estabilidade = Math.min(
      1,
      t.correct + t.wrong >= 4 ? 0.5 + dominio * 0.5 : 0.35
    )
    const retencao = dominio * 0.6 + estabilidade * 0.4

    const taxMap = errorByTopic.get(t.topic)
    let predominant_error: ErrorTaxonomy | undefined
    if (taxMap?.size) {
      predominant_error = [...taxMap.entries()].sort(
        (a, b) => b[1] - a[1]
      )[0]![0] as ErrorTaxonomy
    }

    const status = statusFromMetrics(dominio, estabilidade, t.wrong)
    topic_map[t.topic] = {
      status,
      dominio: Math.round(dominio * 100) / 100,
      estabilidade: Math.round(estabilidade * 100) / 100,
      retencao: Math.round(retencao * 100) / 100,
      predominant_error,
    }

    if (status === "critico" || status === "ilusao_dominio") {
      danger_topics.push(t.topic)
    }
  }

  const sorted = topicStats.sort((a, b) => {
    const da = dominioFromStats(a.correct, a.wrong)
    const db = dominioFromStats(b.correct, b.wrong)
    return da - db
  })
  const weak = sorted.slice(0, 3).map((t) => dominioFromStats(t.correct, t.wrong))
  const strong = sorted.slice(-3).map((t) => dominioFromStats(t.correct, t.wrong))
  const trend =
    weak.length && strong.length && strong[strong.length - 1]! > weak[0]! + 0.15
      ? "melhorando"
      : weak[0]! < 0.4
        ? "piorando"
        : "estagnado"

  const error_profile_by_topic: Record<string, ErrorTaxonomy> = {}
  for (const [topic, entry] of Object.entries(topic_map)) {
    if (entry.predominant_error) {
      error_profile_by_topic[topic] = entry.predominant_error
    }
  }

  return {
    topic_map,
    error_profile_by_topic,
    danger_topics: [...new Set(danger_topics)].slice(0, 12),
    trend: trend as SubjectBrainState["trend"],
    last_report_id: reportId,
  }
}

export async function ingestBrainFromReport(
  userId: string,
  subjectId: string,
  reportId: string
) {
  const state = await computeSubjectBrainState(userId, subjectId, reportId)
  const context = await buildBrainContext(userId, subjectId)

  const narrativeResult = await runBrainNarrativeAgent({
    userId,
    subjectId,
    state,
    context: context as unknown as Record<string, unknown>,
  }).catch(() => ({ summaryMd: "", trend: undefined }))

  const finalTrend =
    (narrativeResult.trend as SubjectBrainState["trend"]) ?? state.trend

  await supabaseServer.from("subject_brain_state").upsert(
    {
      user_id: userId,
      subject_id: subjectId,
      state: { ...state, trend: finalTrend },
      summary_md: narrativeResult.summaryMd || null,
      last_report_id: reportId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,subject_id" }
  )

  return state
}
