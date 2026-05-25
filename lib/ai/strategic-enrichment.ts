import { supabaseServer } from "../supabase-server"
import { buildStrategicAnalysisPayload } from "../strategic-analysis"
import { getStrategicMdDocument } from "../strategic-md-import"
import type { StrategicEnrichment } from "../strategic-md-types"
import { runAgent } from "./run-agent"
import { getUserAiCredentials } from "./user-credentials"

const ENRICH_SYSTEM = `Você é coach de concursos. Com base no JSON da análise estratégica já importada, gere complementos.
Responda JSON válido:
{
  "edital_hierarchy": [
    {
      "subject": "nome da matéria no edital",
      "children": [
        {
          "topic": "assunto ou capítulo",
          "children": [{ "topic": "subtópico opcional" }]
        }
      ]
    }
  ],
  "nuclear_topics": [
    { "subject": "", "topic": "", "why": "por que é nuclear (cai muito, conecta temas, destrava matéria)" }
  ],
  "predictability_index": [
    { "subject": "", "slug": "", "score": 0-100, "label": "estavel|moderado|imprevisivel", "why": "" }
  ],
  "topic_matrix_enriched": [
    {
      "subject": "",
      "topic": "",
      "incidence_percent": 0,
      "incidence_quantity": 0,
      "your_gap": "breve",
      "action": "ação concreta"
    }
  ]
}
Use só matérias do edital. Hierarquia com 2-3 níveis quando possível.`

export async function enrichStrategicAnalysis(
  userId: string,
  examTargetId: string
) {
  const credentials = await getUserAiCredentials(userId)
  if (!credentials) {
    throw new Error("Configure sua chave de IA em Coach → Configurações.")
  }

  const doc = await getStrategicMdDocument(userId, examTargetId)
  if (!doc) throw new Error("Importe o arquivo .md de análise estratégica primeiro.")

  const payload = await buildStrategicAnalysisPayload(userId, examTargetId)
  const pt = (doc.parsed_tables ?? {}) as { full_text?: string; bundle?: unknown }

  const input = {
    bundle_summary: {
      metadata: payload.bundle?.metadata,
      edital_subjects: payload.bundle?.edital_subjects,
      subject_ranking: payload.bundle?.subject_ranking?.slice(0, 14),
      incidence_subjects: payload.bundle?.incidence_subjects,
      topics_sample: Object.fromEntries(
        Object.entries(payload.bundle?.topics_by_slug ?? {}).slice(0, 8).map(([k, v]) => [
          k,
          (v as { topic: string; quantity: number }[]).slice(0, 8),
        ])
      ),
      priorities: payload.bundle?.priorities,
      study_order: payload.bundle?.study_order?.slice(0, 12),
    },
    existing_priorities: payload.priorities,
    strategic_queue: payload.strategic_queue_preview,
    incidence_row_count: payload.incidence_row_count,
    heuristics: {
      predictability: payload.enrichment?.predictability_index,
      nuclear: payload.enrichment?.nuclear_topics,
    },
  }

  const excerpt = String(pt.full_text ?? "").slice(0, 60_000)

  const result = await runAgent({
    agentType: "edital",
    userId,
    examTargetId,
    systemPrompt: ENRICH_SYSTEM,
    userContent: `Trecho do MD (início):\n${excerpt.slice(0, 25_000)}\n\n---\nDados estruturados:\n${JSON.stringify(input)}`,
    jsonMode: true,
    maxTokens: 4500,
    metadata: { phase: "strategic_enrichment" },
  })

  let enrichment: StrategicEnrichment = {}
  try {
    enrichment = JSON.parse(result.text || "{}") as StrategicEnrichment
  } catch {
    throw new Error("IA retornou JSON inválido no enriquecimento.")
  }

  enrichment.enriched_at = new Date().toISOString()
  enrichment.model_used = result.model

  const { data: existing } = await supabaseServer
    .from("exam_edital_analysis")
    .select("priorities")
    .eq("exam_target_id", examTargetId)
    .eq("user_id", userId)
    .maybeSingle()

  const priorities = {
    ...((existing?.priorities ?? {}) as Record<string, unknown>),
    topic_matrix:
      enrichment.topic_matrix_enriched ??
      (existing?.priorities as { topic_matrix?: unknown })?.topic_matrix,
  }

  await supabaseServer.from("exam_edital_analysis").upsert(
    {
      exam_target_id: examTargetId,
      user_id: userId,
      enrichment,
      priorities,
      model_used: result.model,
      analyzed_at: new Date().toISOString(),
    },
    { onConflict: "exam_target_id" }
  )

  await supabaseServer.from("ai_runs").insert({
    user_id: userId,
    agent_type: "strategic_enrichment",
    tokens_in: result.tokensIn,
    tokens_out: result.tokensOut,
    cost_estimate: result.costUsd,
    status: "ok",
    metadata: { exam_target_id: examTargetId },
  })

  const { syncEditalWeightsToQueue } = await import("./strategic-queue")
  await syncEditalWeightsToQueue(userId, examTargetId).catch(() => {})

  return { enrichment, model_used: result.model }
}
