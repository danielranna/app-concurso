import { supabaseServer } from "../supabase-server"
import {
  buildIncidencePayloadForExam,
  documentTextExcerpt,
  listCoachDocuments,
} from "../coach-documents"
import { normLabel } from "../incidence-subject-map"
import { fetchIncidenceRows } from "../incidence-rows-db"
import { runAgent } from "./run-agent"
import { getUserAiCredentials } from "./user-credentials"
import type { ExamPlanStructured } from "../coach-types"
import {
  asExamPlanStructured,
  buildCoachEditalSummaryMd,
} from "../coach-edital-format"

const STRUCTURE_SYSTEM = `Você extrai a estrutura de um edital de concurso público.
Liste APENAS matérias e assuntos que aparecem explicitamente no edital.
Responda JSON válido:
{
  "subjects": [
    {
      "name": "nome da matéria no edital",
      "edital_weight": "alta|media|baixa",
      "topics": [{ "name": "assunto ou tópico", "weight_hint": "opcional" }]
    }
  ]
}`

const PRIORITIES_SYSTEM = `Você é coach de concursos. Cruza edital (pesos) com incidência histórica da banca.
Use APENAS os dados JSON. Priorize matérias do edital com maior ROI (peso edital × incidência).
Responda JSON válido:
{
  "headline": "",
  "subject_priority_rank": [
    { "subject_name": "", "priority": 1, "why": "", "edital_weight": "", "incidence_summary": "" }
  ],
  "topic_matrix": [
    {
      "subject": "",
      "topic": "",
      "edital_weight_hint": "",
      "incidence_hint": "",
      "incidence_percent": 0,
      "incidence_quantity": 0,
      "your_gap": "",
      "action": ""
    }
  ],
  "risks_if_ignored": [],
  "exam_readiness_score": 0
}`

function scoreNameMatch(a: string, b: string): number {
  const na = normLabel(a)
  const nb = normLabel(b)
  if (!na || !nb) return 0
  if (na === nb) return 100
  if (na.includes(nb) || nb.includes(na)) return 80
  const aw = na.split(/\s+/).filter((w) => w.length > 2)
  const bw = nb.split(/\s+/).filter((w) => w.length > 2)
  const shared = aw.filter((w) => bw.some((x) => x.includes(w) || w.includes(x)))
  return shared.length >= 2 ? 60 : shared.length === 1 ? 35 : 0
}

function matchIncidenceToEditalSubjects(
  editalSubjects: { name: string; topics: { name: string }[] }[],
  incidenceRows: {
    subject_label: string
    topic_name: string
    percent: number
    quantity: number
    is_subtopic: boolean
  }[]
) {
  const byEditalSubject: Record<
    string,
    {
      subject_label: string
      match_score: number
      rows: typeof incidenceRows
    }
  > = {}

  for (const es of editalSubjects) {
    const labels = new Set<string>()
    let bestLabel = ""
    let bestScore = 0

    const distinctLabels = [...new Set(incidenceRows.map((r) => r.subject_label))]
    for (const label of distinctLabels) {
      const s = scoreNameMatch(label, es.name)
      if (s > bestScore) {
        bestScore = s
        bestLabel = label
      }
    }

    if (bestScore >= 35 && bestLabel) {
      byEditalSubject[es.name] = {
        subject_label: bestLabel,
        match_score: bestScore,
        rows: incidenceRows.filter((r) => r.subject_label === bestLabel),
      }
    } else {
      byEditalSubject[es.name] = {
        subject_label: "",
        match_score: 0,
        rows: [],
      }
    }
  }

  return byEditalSubject
}

function buildIncidencePayloadForLlm(
  editalSubjects: { name: string; edital_weight?: string; topics: { name: string }[] }[],
  matched: ReturnType<typeof matchIncidenceToEditalSubjects>
) {
  return editalSubjects.map((es) => {
    const m = matched[es.name]
    const topicNames = new Set(es.topics.map((t) => normLabel(t.name)))
    const rows = (m?.rows ?? []).filter((r) => {
      if (!topicNames.size) return true
      for (const tn of topicNames) {
        if (scoreNameMatch(r.topic_name, tn) >= 35) return true
      }
      return topicNames.size === 0
    })

    const sorted = [...rows].sort((a, b) => Number(b.percent) - Number(a.percent))

    return {
      edital_subject: es.name,
      edital_weight: es.edital_weight,
      excel_subject_label: m?.subject_label ?? null,
      match_score: m?.match_score ?? 0,
      topics_from_edital: es.topics.map((t) => t.name),
      incidence_topics: sorted.slice(0, 80).map((r) => ({
        topic: r.topic_name,
        percent: Number(r.percent),
        quantity: r.quantity,
        is_subtopic: r.is_subtopic,
      })),
      incidence_aggregate_percent: sorted.reduce((s, r) => s + Number(r.percent), 0),
    }
  })
}

export async function analyzeExamEdital(
  userId: string,
  examTargetId: string
): Promise<{
  structured: ExamPlanStructured
  summary_md: string
  analysis_id: string
  model_used: string
}> {
  const credentials = await getUserAiCredentials(userId)
  if (!credentials) {
    throw new Error(
      "Configure sua chave de IA em Coach → Configurações (ou variável de ambiente)."
    )
  }

  const { data: exam } = await supabaseServer
    .from("exam_targets")
    .select("*")
    .eq("id", examTargetId)
    .eq("user_id", userId)
    .single()

  if (!exam) throw new Error("Prova alvo não encontrada")

  const docs = await listCoachDocuments(userId, { examTargetId })
  const editalDoc = docs.find((d) => d.doc_type === "edital")
  if (!editalDoc) throw new Error("Envie o PDF do edital antes de analisar.")

  const editalText = documentTextExcerpt(editalDoc)
  const chunks: string[] = []
  const chunkSize = 90_000
  for (let i = 0; i < editalText.length; i += chunkSize) {
    chunks.push(editalText.slice(i, i + chunkSize))
  }

  let structure: {
    subjects: { name: string; edital_weight?: string; topics: { name: string }[] }[]
  } = { subjects: [] }

  for (let i = 0; i < chunks.length; i++) {
    const part = await runAgent({
      agentType: "edital",
      userId,
      examTargetId,
      systemPrompt: STRUCTURE_SYSTEM,
      userContent: `Parte ${i + 1}/${chunks.length} do edital:\n\n${chunks[i]}`,
      jsonMode: true,
      maxTokens: 4000,
      metadata: { phase: "structure", chunk: i },
    })
    try {
      const parsed = JSON.parse(part.text || "{}") as typeof structure
      const names = new Set(structure.subjects.map((s) => normLabel(s.name)))
      for (const s of parsed.subjects ?? []) {
        if (!names.has(normLabel(s.name))) {
          structure.subjects.push(s)
          names.add(normLabel(s.name))
        }
      }
    } catch {
      /* merge partial */
    }
  }

  const incidenceRows = await fetchIncidenceRows({
    userId,
    examTargetId,
  })

  const matched = matchIncidenceToEditalSubjects(
    structure.subjects,
    incidenceRows.map((r) => ({
      subject_label: r.subject_label,
      topic_name: r.topic_name,
      percent: Number(r.percent),
      quantity: r.quantity,
      is_subtopic: r.is_subtopic,
    }))
  )

  const incidenceForLlm = buildIncidencePayloadForLlm(structure.subjects, matched)

  const mappingPayload = await buildIncidencePayloadForExam(userId, examTargetId)

  const prioritiesResult = await runAgent({
    agentType: "edital",
    userId,
    examTargetId,
    systemPrompt: PRIORITIES_SYSTEM,
    userContent: JSON.stringify({
      exam_target: { name: exam.name, banca: exam.banca },
      edital_subjects: structure.subjects,
      incidence_crosswalk: incidenceForLlm,
      app_subject_mappings: mappingPayload.for_llm,
    }),
    jsonMode: true,
    maxTokens: 4500,
    metadata: { phase: "priorities" },
  })

  const structuredRaw = JSON.parse(prioritiesResult.text || "{}") as Record<string, unknown>
  const structured = asExamPlanStructured(structuredRaw)
  const summaryMd = buildCoachEditalSummaryMd(exam.name, structured)

  const modelUsed = prioritiesResult.model

  const { data: analysis, error } = await supabaseServer
    .from("exam_edital_analysis")
    .upsert(
      {
        exam_target_id: examTargetId,
        user_id: userId,
        structure,
        priorities: structured,
        edital_full_text_length: editalText.length,
        model_used: modelUsed,
        analyzed_at: new Date().toISOString(),
      },
      { onConflict: "exam_target_id" }
    )
    .select("id")
    .single()

  if (error) throw new Error(error.message)

  await supabaseServer.from("exam_target_reports").insert({
    exam_target_id: examTargetId,
    user_id: userId,
    summary_md: summaryMd,
    structured,
    input_snapshot: {
      edital_subjects_count: structure.subjects.length,
      incidence_rows_count: incidenceRows.length,
      incidence_crosswalk: incidenceForLlm,
    },
    model_used: modelUsed,
  })

  await supabaseServer.from("ai_runs").insert({
    user_id: userId,
    agent_type: "edital_analysis",
    tokens_in: prioritiesResult.tokensIn,
    tokens_out: prioritiesResult.tokensOut,
    cost_estimate: prioritiesResult.costUsd,
    status: "ok",
    metadata: { exam_target_id: examTargetId, analysis_id: analysis?.id },
  })

  const { syncEditalWeightsToQueue } = await import("./strategic-queue")
  await syncEditalWeightsToQueue(userId, examTargetId).catch(() => {})

  return {
    structured,
    summary_md: summaryMd,
    analysis_id: analysis!.id,
    model_used: modelUsed,
  }
}

export async function getExamEditalAnalysis(userId: string, examTargetId: string) {
  const { data } = await supabaseServer
    .from("exam_edital_analysis")
    .select("*")
    .eq("user_id", userId)
    .eq("exam_target_id", examTargetId)
    .maybeSingle()

  return data
}
