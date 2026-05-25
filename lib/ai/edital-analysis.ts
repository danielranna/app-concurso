import { supabaseServer } from "../supabase-server"
import { documentTextExcerpt, listCoachDocuments } from "../coach-documents"
import { normLabel } from "../incidence-subject-map"
import { fetchIncidenceRows } from "../incidence-rows-db"
import { runAgent } from "./run-agent"
import { getUserAiCredentials } from "./user-credentials"
import type { ExamPlanStructured } from "../coach-types"
import {
  asExamPlanStructured,
  buildCoachEditalSummaryMd,
} from "../coach-edital-format"

const STRUCTURE_SYSTEM = `Você extrai a estrutura de um edital de concurso público (texto do PDF).
Liste APENAS matérias e assuntos explicitamente no edital.
Inclua peso, quantidade de questões/itens, prova (P1/P2) e critérios de pontuação quando existirem.
Responda JSON válido:
{
  "exam_summary": "resumo em 2-4 frases",
  "scoring_notes": ["critérios de pontuação ou desempate se houver"],
  "subjects": [
    {
      "name": "nome da matéria no edital",
      "prova": "P1|P2|única",
      "question_count": 0,
      "percent_of_total": 0,
      "edital_weight": "alta|media|baixa ou peso numérico",
      "topics": [{ "name": "assunto ou tópico", "weight_hint": "opcional" }]
    }
  ]
}`

const PRIORITIES_SYSTEM = `Você é especialista em concursos públicos. Analise o edital (estrutura extraída do PDF) e cruze com a incidência histórica da banca (JSON), quando fornecida.

Tarefas:
1) Ranking de relevância das matérias do edital — ordene por impacto na nota final.
2) Para cada matéria: peso no edital, quantidade de questões, % do total, prova, critérios de desempate (se existirem), impacto na nota, resumo da incidência da banca.
3) Explique resumidamente o motivo da posição de cada matéria no ranking.
4) Classifique matérias em: prioritárias, secundárias e possíveis "armadilha" (muito extensas no edital e pouco cobradas historicamente).
5) Resumo do edital, conclusões estratégicas e notas sobre o mapa de incidência da banca.

Use APENAS dados fornecidos. Se não houver incidência da banca, baseie-se só no edital e indique isso.

Responda JSON válido:
{
  "headline": "título curto da análise",
  "edital_summary": "resumo do edital",
  "strategic_conclusions": ["conclusão 1", "conclusão 2"],
  "priority_subjects": [{ "name": "", "why": "" }],
  "secondary_subjects": [{ "name": "", "why": "" }],
  "trap_subjects": [{ "name": "", "why": "" }],
  "subject_priority_rank": [
    {
      "subject_name": "",
      "priority": 1,
      "why": "motivo da posição no ranking",
      "edital_weight": "",
      "question_count": 0,
      "percent_of_total": 0,
      "prova": "",
      "tiebreaker_note": "",
      "impact_on_final_score": "alto|medio|baixo",
      "incidence_summary": ""
    }
  ],
  "incidence_map_notes": [
    {
      "edital_subject": "",
      "excel_subject": "",
      "top_topics": ["tópico mais cobrado"],
      "note": ""
    }
  ],
  "topic_matrix": [
    {
      "subject": "",
      "topic": "",
      "edital_weight_hint": "",
      "incidence_hint": "",
      "incidence_percent": 0,
      "incidence_quantity": 0,
      "action": ""
    }
  ],
  "risks_if_ignored": [],
  "exam_readiness_score": 0
}

No topic_matrix: no máximo 6 tópicos por matéria e só para as 12 matérias mais relevantes do ranking.`

/** ~4 chars/token — mantém cada chamada bem abaixo do TPM 30k do gpt-4o */
const MAX_EDITAL_CHARS = 55_000
const STRUCTURE_CHUNK_CHARS = 16_000
const MAX_TOPICS_PER_EDITAL_SUBJECT = 15
const MAX_INCIDENCE_TOPICS_PER_SUBJECT = 12
const MAX_PRIORITIES_PAYLOAD_CHARS = 72_000

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function compactEditalSubjects(
  subjects: {
    name: string
    edital_weight?: string
    question_count?: number
    percent_of_total?: number
    prova?: string
    topics?: { name: string; weight_hint?: string }[]
  }[]
) {
  return subjects.map((s) => ({
    name: s.name,
    edital_weight: s.edital_weight,
    question_count: s.question_count,
    percent_of_total: s.percent_of_total,
    prova: s.prova,
    topics: (s.topics ?? [])
      .slice(0, MAX_TOPICS_PER_EDITAL_SUBJECT)
      .map((t) => ({ name: t.name })),
  }))
}

function trimPayloadJson(payload: unknown, maxChars: number): string {
  let json = JSON.stringify(payload)
  if (json.length <= maxChars) return json

  const p = payload as {
    edital_subjects?: ReturnType<typeof compactEditalSubjects>
    incidence_crosswalk?: ReturnType<typeof buildIncidencePayloadForLlm>
  }

  const slimCrosswalk = (p.incidence_crosswalk ?? []).map((row) => ({
    ...row,
    topics_from_edital: (row.topics_from_edital ?? []).slice(0, 8),
    incidence_topics: (row.incidence_topics ?? []).slice(0, 6),
  }))

  const slimmerSubjects = (p.edital_subjects ?? []).map((s) => ({
    ...s,
    topics: (s.topics ?? []).slice(0, 8),
  }))

  json = JSON.stringify({
    ...p,
    edital_subjects: slimmerSubjects,
    incidence_crosswalk: slimCrosswalk,
    _note: "payload reduzido por limite de tokens",
  })

  if (json.length > maxChars) {
    return JSON.stringify({
      exam_target: (payload as { exam_target?: unknown }).exam_target,
      edital_subjects: slimmerSubjects,
      incidence_crosswalk: slimCrosswalk.map((r) => ({
        edital_subject: r.edital_subject,
        edital_weight: r.edital_weight,
        excel_subject_label: r.excel_subject_label,
        incidence_topics: (r.incidence_topics ?? []).slice(0, 5),
      })),
      _note: "payload mínimo por limite de tokens",
    })
  }
  return json
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /rate limit|tokens per min|TPM|too large/i.test(msg)
}

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
      incidence_topics: sorted
        .filter((r) => !r.is_subtopic)
        .slice(0, MAX_INCIDENCE_TOPICS_PER_SUBJECT)
        .map((r) => ({
          topic: r.topic_name,
          percent: Number(r.percent),
          quantity: r.quantity,
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

  const editalText = documentTextExcerpt(editalDoc).slice(0, MAX_EDITAL_CHARS)
  const chunks: string[] = []
  for (let i = 0; i < editalText.length; i += STRUCTURE_CHUNK_CHARS) {
    chunks.push(editalText.slice(i, i + STRUCTURE_CHUNK_CHARS))
  }

  let structure: {
    subjects: { name: string; edital_weight?: string; topics: { name: string }[] }[]
  } = { subjects: [] }

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await sleep(1200)
    const part = await runAgent({
      agentType: "edital",
      userId,
      examTargetId,
      model: "gpt-4o-mini",
      systemPrompt: STRUCTURE_SYSTEM,
      userContent: `Parte ${i + 1}/${chunks.length} do edital:\n\n${chunks[i]}`,
      jsonMode: true,
      maxTokens: 3500,
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
  const compactSubjects = compactEditalSubjects(structure.subjects)

  const prioritiesPayload = {
    exam_target: { name: exam.name, banca: exam.banca },
    edital_subjects: compactSubjects,
    incidence_crosswalk: incidenceForLlm,
    incidence_rows_total: incidenceRows.length,
  }
  const prioritiesUserContent = trimPayloadJson(
    prioritiesPayload,
    MAX_PRIORITIES_PAYLOAD_CHARS
  )

  let prioritiesResult
  try {
    prioritiesResult = await runAgent({
      agentType: "edital",
      userId,
      examTargetId,
      systemPrompt: PRIORITIES_SYSTEM,
      userContent: prioritiesUserContent,
      jsonMode: true,
      maxTokens: 4000,
      metadata: { phase: "priorities" },
    })
  } catch (e) {
    if (!isRateLimitError(e)) throw e
    await sleep(2000)
    const minimalContent = trimPayloadJson(
      {
        exam_target: prioritiesPayload.exam_target,
        edital_subjects: compactSubjects.map((s) => ({
          name: s.name,
          edital_weight: s.edital_weight,
          question_count: s.question_count,
          percent_of_total: s.percent_of_total,
          prova: s.prova,
        })),
        incidence_crosswalk: incidenceForLlm.map((r) => ({
          edital_subject: r.edital_subject,
          edital_weight: r.edital_weight,
          excel_subject_label: r.excel_subject_label,
          incidence_topics: (r.incidence_topics ?? []).slice(0, 5),
        })),
      },
      40_000
    )
    prioritiesResult = await runAgent({
      agentType: "edital",
      userId,
      examTargetId,
      systemPrompt: PRIORITIES_SYSTEM,
      userContent: minimalContent,
      jsonMode: true,
      maxTokens: 4000,
      metadata: { phase: "priorities_retry" },
    })
  }

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
