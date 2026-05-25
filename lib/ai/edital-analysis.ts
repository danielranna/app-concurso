import { supabaseServer } from "../supabase-server"
import { documentTextExcerpt, listCoachDocuments } from "../coach-documents"
import { normLabel } from "../incidence-subject-map"
import { fetchIncidenceRows } from "../incidence-rows-db"
import { runAgent } from "./run-agent"
import { getUserAiCredentials } from "./user-credentials"
import type { EditalSubjectRankRow, ExamPlanStructured } from "../coach-types"
import { isDiscursiveSubject, type DiscursiveSubjectNote } from "../edital-discursive"
import {
  applyObjectivePercentToRank,
  computeObjectivePercentBreakdown,
} from "../edital-percent-calc"
import { persistEditalSubjectRank } from "../edital-subject-rank-db"
import {
  asExamPlanStructured,
  buildCoachEditalSummaryMd,
  parseCoachEditalJson,
} from "../coach-edital-format"

const STRUCTURE_SYSTEM = `Você extrai a estrutura de um edital de concurso público (texto do PDF).
Liste APENAS matérias e assuntos explicitamente no edital.
Inclua peso, quantidade de questões/itens (só prova objetiva em question_count), prova (P1/P2) e critérios de pontuação.
Marque is_discursive: true para provas/matérias discursivas, estudo de caso, peças, pareceres.
NÃO some questões discursivas em percentuais — question_count e percent_of_total na extração referem-se só ao bloco objetivo daquela matéria (0 se for só discursiva).
Responda JSON válido:
{
  "exam_summary": "resumo em 2-4 frases",
  "scoring_notes": ["critérios de pontuação ou desempate se houver"],
  "total_objective_questions": 0,
  "subjects": [
    {
      "name": "nome da matéria no edital",
      "is_discursive": false,
      "prova": "P1|P2|única",
      "question_count": 0,
      "percent_of_total": 0,
      "edital_weight": "alta|media|baixa ou peso numérico",
      "topics": [{ "name": "assunto ou tópico", "weight_hint": "opcional" }]
    }
  ]
}`

const PRIORITIES_SYSTEM = `Você é especialista em concursos públicos. Analise edital_subjects (já sem discursivas na lista) e incidence_crosswalk quando existir.

RANKING (subject_priority_rank):
- Uma linha por CADA matéria objetiva de edital_subjects, sem omitir.
- NUNCA incluir discursivas no ranking nem no cálculo de %.
- priority 1 = maior impacto na nota da prova objetiva.

CÁLCULO DA % (OBRIGATÓRIO — campo percent_calculation em cada matéria):
1) Some apenas question_count das matérias OBJETIVAS do edital → total_objetivo.
2) percent_of_total de cada matéria = (question_count da matéria ÷ total_objetivo) × 100, arredondado 2 casas.
3) Em percent_calculation escreva a conta explícita, ex.: "25 questões ÷ 133 questões objetivas × 100 = 18,80% (discursivas excluídas do total)".
4) Se o edital não tiver quantidades, estime pelo peso/pontuação e explique em percent_calculation (deixe claro que é estimativa).
5) Preencha objective_percent_formula com a regra usada (1 frase + total_objetivo se houver).

Discursivas: só em discursive_subjects + discursive_note (sem % no ranking objetivo).

Campos por matéria: why (≤120 chars), edital_weight, question_count, percent_of_total, percent_calculation, prova, tiebreaker_note, impact_on_final_score, incidence_summary (1 frase).

Responda JSON válido:
{
  "headline": "",
  "edital_summary": "",
  "objective_percent_formula": "",
  "strategic_conclusions": [],
  "priority_subjects": [{ "name": "", "why": "" }],
  "secondary_subjects": [{ "name": "", "why": "" }],
  "trap_subjects": [{ "name": "", "why": "" }],
  "discursive_subjects": [{ "name": "", "question_count": 0, "prova": "", "note": "" }],
  "discursive_note": "",
  "subject_priority_rank": [
    {
      "subject_name": "",
      "priority": 1,
      "why": "",
      "edital_weight": "",
      "question_count": 0,
      "percent_of_total": 0,
      "percent_calculation": "",
      "prova": "",
      "tiebreaker_note": "",
      "impact_on_final_score": "alto|medio|baixo",
      "incidence_summary": ""
    }
  ],
  "risks_if_ignored": [],
  "exam_readiness_score": 0
}`

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

function findLlmRankForSubject(
  llmRank: EditalSubjectRankRow[],
  editalName: string
): EditalSubjectRankRow | undefined {
  const key = normLabel(editalName)
  return llmRank.find(
    (r) =>
      normLabel(r.subject_name) === key ||
      scoreNameMatch(r.subject_name, editalName) >= 80
  )
}

export function splitDiscursiveSubjects<
  T extends {
    name: string
    is_discursive?: boolean
    question_count?: number
    percent_of_total?: number
    prova?: string
  },
>(subjects: T[]) {
  const objective: T[] = []
  const discursive: DiscursiveSubjectNote[] = []
  for (const s of subjects) {
    if (s.is_discursive === true || isDiscursiveSubject(s.name)) {
      discursive.push({
        name: s.name,
        question_count: s.question_count,
        percent_of_total: s.percent_of_total,
        prova: s.prova,
        note: "Prova discursiva — fora do ranking de matérias objetivas.",
      })
    } else {
      objective.push(s)
    }
  }
  return { objective, discursive }
}

/** Garante uma linha no ranking para cada matéria objetiva do edital (sem discursivas). */
export function ensureFullSubjectRanking(
  editalSubjects: {
    name: string
    edital_weight?: string
    question_count?: number
    percent_of_total?: number
    prova?: string
  }[],
  llmRank: EditalSubjectRankRow[]
): EditalSubjectRankRow[] {
  const { objective } = splitDiscursiveSubjects(editalSubjects)
  const objectiveRank = llmRank.filter(
    (r) => !isDiscursiveSubject(r.subject_name ?? "")
  )

  const merged = objective.map((es) => {
    const fromLlm = findLlmRankForSubject(objectiveRank, es.name)
    if (fromLlm) {
      return {
        ...fromLlm,
        subject_name: es.name,
        edital_weight: fromLlm.edital_weight ?? es.edital_weight,
        question_count: fromLlm.question_count ?? es.question_count,
        percent_of_total: fromLlm.percent_of_total ?? es.percent_of_total,
        prova: fromLlm.prova ?? es.prova,
      }
    }
    return {
      subject_name: es.name,
      priority: 999,
      edital_weight: es.edital_weight,
      question_count: es.question_count,
      percent_of_total: es.percent_of_total,
      prova: es.prova,
      why: "Matéria do edital incluída automaticamente (detalhes não retornados pela IA).",
      impact_on_final_score:
        (es.percent_of_total ?? 0) >= 10 || (es.question_count ?? 0) >= 15
          ? "alto"
          : (es.percent_of_total ?? 0) >= 5 || (es.question_count ?? 0) >= 8
            ? "medio"
            : "baixo",
      incidence_summary: "",
    }
  })

  merged.sort((a, b) => {
    const aLlm = (a.priority ?? 999) < 900
    const bLlm = (b.priority ?? 999) < 900
    if (aLlm && bLlm) return (a.priority ?? 0) - (b.priority ?? 0)
    if (aLlm && !bLlm) return -1
    if (!aLlm && bLlm) return 1
    const qd = (b.question_count ?? 0) - (a.question_count ?? 0)
    if (qd !== 0) return qd
    return (b.percent_of_total ?? 0) - (a.percent_of_total ?? 0)
  })

  return merged.map((r, i) => ({ ...r, priority: i + 1 }))
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
  subject_rank: EditalSubjectRankRow[]
  edital_subjects_count: number
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

  const chunksToProcess = chunks.slice(0, 4)
  for (let i = 0; i < chunksToProcess.length; i++) {
    if (i > 0) await sleep(1200)
    const part = await runAgent({
      agentType: "edital",
      userId,
      examTargetId,
      model: "gpt-4o-mini",
      systemPrompt: STRUCTURE_SYSTEM,
      userContent: `Parte ${i + 1}/${chunksToProcess.length} do edital:\n\n${chunksToProcess[i]}`,
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

  const { objective: objectiveSubjectsEarly, discursive: discursiveEarly } =
    splitDiscursiveSubjects(structure.subjects)

  const matched = matchIncidenceToEditalSubjects(
    objectiveSubjectsEarly,
    incidenceRows.map((r) => ({
      subject_label: r.subject_label,
      topic_name: r.topic_name,
      percent: Number(r.percent),
      quantity: r.quantity,
      is_subtopic: r.is_subtopic,
    }))
  )

  const incidenceForLlm = buildIncidencePayloadForLlm(
    objectiveSubjectsEarly,
    matched
  )
  const compactSubjects = compactEditalSubjects(objectiveSubjectsEarly)
  const percentHint = computeObjectivePercentBreakdown(objectiveSubjectsEarly)

  const prioritiesPayload = {
    exam_target: { name: exam.name, banca: exam.banca },
    required_subject_count: compactSubjects.length,
    edital_subjects: compactSubjects,
    total_objective_questions: percentHint.totalObjectiveQuestions,
    percent_calculation_rule: percentHint.formulaNote,
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
      maxTokens: 6000,
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
      maxTokens: 6000,
      metadata: { phase: "priorities_retry" },
    })
  }

  const structuredRaw = parseCoachEditalJson(prioritiesResult.text || "{}")
  const structured = asExamPlanStructured(structuredRaw)
  if (
    !structure.subjects.length &&
    !(structured.subject_priority_rank?.length ?? 0)
  ) {
    throw new Error(
      "Não foi possível extrair matérias do PDF. Confira se o arquivo é o edital completo e tente reenviar."
    )
  }

  const objectiveSubjects = objectiveSubjectsEarly
  const discursiveFromStructure = discursiveEarly

  let fullRank = ensureFullSubjectRanking(
    objectiveSubjects,
    structured.subject_priority_rank ?? []
  )

  const percentMeta = computeObjectivePercentBreakdown(objectiveSubjects)
  fullRank = applyObjectivePercentToRank(fullRank, objectiveSubjects)
  structured.subject_priority_rank = fullRank
  structured.objective_percent_formula =
    structured.objective_percent_formula?.trim() ||
    percentMeta.formulaNote

  const llmDiscursive = (structured.discursive_subjects ?? []).filter(
    (d) => d.name && isDiscursiveSubject(d.name)
  )
  const discursiveMerged = [...discursiveFromStructure]
  const discNames = new Set(discursiveMerged.map((d) => normLabel(d.name)))
  for (const d of llmDiscursive) {
    const key = normLabel(d.name)
    if (!discNames.has(key)) {
      discursiveMerged.push(d)
      discNames.add(key)
    }
  }
  if (discursiveMerged.length) {
    structured.discursive_subjects = discursiveMerged
    if (!structured.discursive_note) {
      structured.discursive_note =
        "As matérias/provas discursivas abaixo não entram no ranking objetivo; prepare-as à parte conforme o edital."
    }
  }

  delete (structured as Record<string, unknown>).topic_matrix
  delete (structured as Record<string, unknown>).incidence_map_notes

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

  const suggestedIncidence: Record<string, string> = {}
  for (const es of objectiveSubjects) {
    const m = matched[es.name]
    if (m?.subject_label && (m.match_score ?? 0) >= 35) {
      suggestedIncidence[es.name] = m.subject_label
    }
  }

  try {
    await persistEditalSubjectRank(
      userId,
      examTargetId,
      fullRank,
      suggestedIncidence
    )
  } catch (rankErr) {
    console.warn(
      "exam_edital_subject_rank:",
      rankErr instanceof Error ? rankErr.message : rankErr
    )
  }

  await supabaseServer.from("exam_target_reports").insert({
    exam_target_id: examTargetId,
    user_id: userId,
    summary_md: summaryMd,
    structured,
    input_snapshot: {
      edital_subjects_count: structure.subjects.length,
      rank_rows_count: fullRank.length,
      incidence_rows_count: incidenceRows.length,
    },
    model_used: modelUsed,
  }).then(({ error: reportErr }) => {
    if (reportErr) {
      console.warn("exam_target_reports:", reportErr.message)
    }
  })

  await supabaseServer.from("ai_runs").insert({
    user_id: userId,
    agent_type: "edital_analysis",
    tokens_in: prioritiesResult.tokensIn,
    tokens_out: prioritiesResult.tokensOut,
    cost_estimate: prioritiesResult.costUsd,
    status: "ok",
    metadata: { exam_target_id: examTargetId, analysis_id: analysis?.id },
  }).then(({ error: runErr }) => {
    if (runErr) console.warn("ai_runs edital_analysis:", runErr.message)
  })

  const { syncEditalWeightsToQueue } = await import("./strategic-queue")
  await syncEditalWeightsToQueue(userId, examTargetId).catch(() => {})

  return {
    structured,
    summary_md: summaryMd,
    analysis_id: analysis!.id,
    model_used: modelUsed,
    subject_rank: fullRank,
    edital_subjects_count: structure.subjects.length,
  }
}

export async function getExamEditalAnalysis(userId: string, examTargetId: string) {
  const { data } = await supabaseServer
    .from("exam_edital_analysis")
    .select("*")
    .eq("user_id", userId)
    .eq("exam_target_id", examTargetId)
    .maybeSingle()

  if (!data) return null

  const { fetchEditalSubjectRank } = await import("../edital-subject-rank-db")
  let subject_rank: EditalSubjectRankRow[] = []
  try {
    subject_rank = await fetchEditalSubjectRank(userId, examTargetId)
  } catch {
    /* tabela ainda não criada */
  }

  if (!subject_rank.length && data.priorities) {
    const p = data.priorities as ExamPlanStructured
    subject_rank = p.subject_priority_rank ?? []
  }

  const structureSubjects = (
    data.structure as { subjects?: { name: string; edital_weight?: string; question_count?: number; percent_of_total?: number; prova?: string }[] }
  )?.subjects

  if (structureSubjects?.length) {
    const { objective } = splitDiscursiveSubjects(structureSubjects)
    subject_rank = ensureFullSubjectRanking(objective, subject_rank)
  }

  return { ...data, subject_rank }
}
