import { supabaseServer } from "./supabase-server"
import { fetchIncidenceRows } from "./incidence-rows-db"
import { labelsForSubjectFromMd } from "./strategic-md-map"
import type {
  StrategicAnalysisPayload,
  StrategicEnrichment,
  StrategicMdBundle,
  StrategicMdMappings,
} from "./strategic-md-types"
import type { ExamPlanStructured } from "./coach-types"
import { getStrategicMdDocument } from "./strategic-md-import"

function computePredictability(
  bundle: StrategicMdBundle
): StrategicEnrichment["predictability_index"] {
  return bundle.edital_subjects.map((sub) => {
    const topics = bundle.topics_by_slug[sub.slug] ?? []
    const inc = bundle.incidence_subjects.find((i) => i.slug === sub.slug)
    let label: "estavel" | "moderado" | "imprevisivel" = "moderado"
    let score = 50

    if (topics.length >= 3) {
      const qs = topics.map((t) => t.quantity)
      const mean = qs.reduce((a, b) => a + b, 0) / qs.length
      const variance =
        qs.reduce((s, q) => s + (q - mean) ** 2, 0) / qs.length
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 1
      if (cv < 0.5) {
        label = "estavel"
        score = 80
      } else if (cv > 1.2) {
        label = "imprevisivel"
        score = 30
      } else {
        score = 55
      }
    }

    const classif = (inc?.classificacao ?? "").toLowerCase()
    if (classif.includes("extremamente")) score = Math.max(score, 75)
    if (classif.includes("pouco")) {
      label = "imprevisivel"
      score = Math.min(score, 35)
    }

    return {
      subject: sub.name,
      slug: sub.slug,
      score,
      label,
      why:
        label === "estavel"
          ? "Distribuição concentrada de tópicos no histórico da banca."
          : label === "imprevisivel"
            ? "Tópicos dispersos ou baixa recorrência histórica."
            : "Recorrência moderada; vale diversificar estudo.",
    }
  })
}

function deriveNuclearTopics(bundle: StrategicMdBundle) {
  const nuclear: StrategicEnrichment["nuclear_topics"] = []
  const phase1Slugs = new Set(
    bundle.study_order
      .filter((s) => s.fase.toLowerCase().includes("fase 1"))
      .map((s) => s.slug)
  )

  for (const p of bundle.priorities.prioritarias.slice(0, 4)) {
    const topics = [...(bundle.topics_by_slug[p.slug] ?? [])]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 3)
    for (const t of topics) {
      nuclear!.push({
        subject: p.name,
        topic: t.topic,
        why: `Prioridade ${p.prioridade} no MD; ${t.quantity} questões históricas (${t.percent}%).`,
      })
    }
  }

  for (const slug of phase1Slugs) {
    const name =
      bundle.edital_subjects.find((s) => s.slug === slug)?.name ?? slug
    const top = bundle.topics_by_slug[slug]?.[0]
    if (top && !nuclear!.some((n) => n.topic === top.topic && n.subject === name)) {
      nuclear!.push({
        subject: name,
        topic: top.topic,
        why: "Etapa nuclear da Fase 1 (ordem de estudo do MD).",
      })
    }
  }

  return nuclear ?? []
}

export async function buildStrategicAnalysisPayload(
  userId: string,
  examTargetId: string
): Promise<StrategicAnalysisPayload> {
  const doc = await getStrategicMdDocument(userId, examTargetId)
  const pt = (doc?.parsed_tables ?? {}) as {
    bundle?: StrategicMdBundle
    subject_mappings?: StrategicMdMappings
    parse_stats?: Record<string, unknown>
  }

  const { data: analysis } = await supabaseServer
    .from("exam_edital_analysis")
    .select("*")
    .eq("user_id", userId)
    .eq("exam_target_id", examTargetId)
    .maybeSingle()

  const { count } = await supabaseServer
    .from("incidence_rows")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("exam_target_id", examTargetId)

  const enrichment = (analysis?.enrichment ?? {}) as StrategicEnrichment
  const bundle = pt.bundle ?? null
  const mappings = pt.subject_mappings ?? null

  const basePredictability = bundle ? computePredictability(bundle) : []
  const baseNuclear = bundle ? deriveNuclearTopics(bundle) : []

  const mergedEnrichment: StrategicEnrichment = {
    ...enrichment,
    predictability_index:
      enrichment.predictability_index?.length
        ? enrichment.predictability_index
        : basePredictability,
    nuclear_topics:
      enrichment.nuclear_topics?.length ? enrichment.nuclear_topics : baseNuclear,
  }

  const { data: queue } = await supabaseServer
    .from("strategic_queue_items")
    .select("subject_id, topic_key, priority_score, gap_score, reason")
    .eq("user_id", userId)
    .order("priority_score", { ascending: false })
    .limit(15)

  return {
    exam_target_id: examTargetId,
    document_id: doc?.id ?? null,
    bundle,
    mappings,
    priorities: (analysis?.priorities ?? null) as ExamPlanStructured | null,
    enrichment: mergedEnrichment,
    incidence_row_count: count ?? 0,
    parse_stats: pt.parse_stats ?? null,
    strategic_queue_preview: queue ?? [],
  }
}

export async function getGlobalTopicRanking(
  userId: string,
  examTargetId: string,
  limit = 30
) {
  const rows = await fetchIncidenceRows({ userId, examTargetId })
  return rows
    .map((r) => ({
      subject: r.subject_label,
      topic: r.topic_name,
      quantity: r.quantity,
      percent: Number(r.percent),
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit)
}

export { labelsForSubjectFromMd }
