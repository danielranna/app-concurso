import type {
  BehavioralAudit,
  BehavioralAuditQuestionItem,
  ErrorTaxonomy,
  FeedbackSource,
  PerQuestionError,
  TeacherCitation,
} from "../../coach-types"
import { runAgent } from "../run-agent"
import { countReportLlmRunsToday } from "../report-helpers"
import { getEffectiveReportPreferences } from "../context-builder"
import {
  buildNotebookAuditPayload,
  type NotebookAuditPayload,
  type NotebookAuditQuestion,
} from "../notebook-audit-payload"
import {
  buildTeacherQueryForError,
  retrieveForTeacher,
} from "../teacher-retrieval"
import { supabaseServer } from "../../supabase-server"
import { mergeUnifiedExplainIntoErrors } from "../merge-unified-errors"

const CHUNKS_PER_QUESTION = 4
const CHUNK_EXCERPT_MAX = 400

const SYSTEM = `Você é o tutor do relatório de caderno — sua função é EXPLICAR, não reclassificar erros.
A taxonomia (tipo de erro) já foi definida em error_taxonomy_hint — use-a no feedback, NÃO invente outra.

Para CADA questão red/yellow: enunciado, marcada vs gabarito, nota do aluno, error_taxonomy_hint e trechos RAG.

REGRAS:
1. Se existir user_note, o feedback DEVE começar corrigindo a lógica da nota.
2. Proibido texto genérico quando a nota ou o enunciado revelam o erro específico.
3. Use material_chunks quando cobrirem o ponto; cite citations com document_title, excerpt, page.
4. source: "material" | "mixed" | "ai_generated"
5. Marcada vs Gabarito sempre claro.
6. Português (BR), tom de professor de concurso.

Responda JSON:
{
  "red_zone": [{ "question_index": 1, "feedback": "", "misconception": "", "source": "material|ai_generated|mixed", "citations": [] }],
  "yellow_zone": [...],
  "green_zone": { "mastered_indexes": [], "theory_balance": "" }
}

Inclua TODAS as questões red e yellow do input (mesmos question_index). Não inclua error_taxonomy na resposta.`

type MaterialChunk = {
  document_title: string
  excerpt: string
  page?: number | null
}

function buildRetrievalQuery(q: NotebookAuditQuestion): string {
  const base = buildTeacherQueryForError({
    tec_topic: q.tec_topic,
    statementSnippet: q.statement_excerpt,
  })
  const note = q.user_note?.trim()
  return note ? `${base} ${note.slice(0, 120)}` : base
}

function chunksToMaterial(chunks: Awaited<ReturnType<typeof retrieveForTeacher>>): MaterialChunk[] {
  return chunks.slice(0, CHUNKS_PER_QUESTION).map((c) => ({
    document_title: c.title,
    excerpt: c.content.slice(0, CHUNK_EXCERPT_MAX),
    page: c.page ?? null,
  }))
}

function chunksToCitations(chunks: MaterialChunk[]): TeacherCitation[] {
  return chunks.map((c) => ({
    document_title: c.document_title,
    excerpt: c.excerpt,
    page: c.page,
  }))
}

async function prefetchMaterialByQuestion(
  userId: string,
  subjectId: string | null,
  questions: NotebookAuditQuestion[]
): Promise<Map<number, MaterialChunk[]>> {
  const map = new Map<number, MaterialChunk[]>()
  if (!subjectId || !questions.length) return map

  await Promise.all(
    questions.map(async (q) => {
      const chunks = await retrieveForTeacher(
        userId,
        subjectId,
        buildRetrievalQuery(q),
        CHUNKS_PER_QUESTION
      )
      map.set(q.question_index, chunksToMaterial(chunks))
    })
  )

  return map
}

function toLlmItem(
  q: NotebookAuditQuestion,
  materialChunks: MaterialChunk[],
  taxonomyHint?: ErrorTaxonomy
) {
  return {
    question_index: q.question_index,
    question_id: q.question_id,
    header_label: q.header_label,
    tec_topic: q.tec_topic,
    statement_excerpt: q.statement_excerpt,
    marked: q.selected_answer,
    answer_key: q.correct_answer,
    is_correct: q.is_correct,
    outcome_category: q.outcome_category,
    confidence_level: q.confidence_level,
    user_note: q.user_note || null,
    zone: q.zone,
    error_taxonomy_hint: taxonomyHint ?? null,
    material_chunks: materialChunks,
  }
}

function parseSource(raw: string | undefined): FeedbackSource {
  if (raw === "material" || raw === "mixed" || raw === "ai_generated") return raw
  return "ai_generated"
}

function buildFallbackItem(
  q: NotebookAuditQuestion,
  materialChunks: MaterialChunk[] = [],
  taxonomyHint?: ErrorTaxonomy
): BehavioralAuditQuestionItem {
  const marked = q.selected_answer
  const key = q.correct_answer
  let feedback = q.is_correct
    ? `Marcada: [${marked}] | Gabarito: [${key}]. Acerto registrado (${q.outcome_category}).`
    : `Marcada: [${marked}] | Gabarito: [${key}]. Você errou nesta questão (${q.outcome_category}).`

  if (q.user_note) {
    feedback += ` Sua nota: "${q.user_note}". Revise o conceito no enunciado e confronte com o gabarito.`
  } else {
    feedback += ` Revise o trecho central do enunciado sobre ${q.tec_topic}.`
  }

  const citations = chunksToCitations(materialChunks)
  const source: FeedbackSource =
    citations.length > 0 ? "material" : "ai_generated"

  if (citations.length > 0) {
    feedback += ` Consulte o material indicado abaixo.`
  }

  return {
    question_index: q.question_index,
    question_id: q.question_id,
    header_label: q.header_label,
    statement_excerpt: q.statement_excerpt.slice(0, 400),
    marked,
    answer_key: key,
    user_note: q.user_note || undefined,
    outcome_category: q.outcome_category,
    confidence_level: q.confidence_level,
    feedback,
    source,
    citations: citations.length > 0 ? citations : undefined,
    error_taxonomy: taxonomyHint,
  }
}

function parseCitations(
  raw: { document_title?: string; excerpt?: string; page?: number | null }[] | undefined
): TeacherCitation[] | undefined {
  if (!raw?.length) return undefined
  const list = raw
    .filter((c) => c.document_title && c.excerpt)
    .map((c) => ({
      document_title: String(c.document_title),
      excerpt: String(c.excerpt).slice(0, 500),
      page: c.page ?? null,
    }))
  return list.length ? list : undefined
}

/** @deprecated Use mergeUnifiedExplainIntoErrors */
export const mergeBehavioralAuditIntoErrors = mergeUnifiedExplainIntoErrors
export { mergeUnifiedExplainIntoErrors }

export async function persistAuditInsightsToAttempts(
  audit: BehavioralAudit,
  payload: NotebookAuditPayload
): Promise<void> {
  for (const item of [...audit.red_zone, ...audit.yellow_zone]) {
    const q = payload.questions.find((x) => x.question_id === item.question_id)
    if (!q?.attempt_id) continue

    const { data: existing } = await supabaseServer
      .from("question_attempts")
      .select("error_detail")
      .eq("id", q.attempt_id)
      .maybeSingle()

    const prev = (existing?.error_detail as Record<string, unknown>) ?? {}

    await supabaseServer
      .from("question_attempts")
      .update({
        error_detail: {
          ...prev,
          misconception: item.misconception,
          specific_mistake: item.misconception ?? prev.specific_mistake,
          feedback_detailed: item.feedback,
          feedback_source: item.source,
          explanation_citations: item.citations,
          unified_explain: true,
        },
      })
      .eq("id", q.attempt_id)
  }
}

export type RunBehavioralAuditResult = {
  audit: BehavioralAudit
  modelUsed: string
  usedLlm: boolean
  tokensIn: number
  tokensOut: number
  costUsd: number
}

type LlmZoneItem = {
  question_index: number
  feedback: string
  misconception?: string
  error_taxonomy?: string
  source?: string
  citations?: { document_title?: string; excerpt?: string; page?: number | null }[]
}

export async function runBehavioralAuditAgent(params: {
  userId: string
  subjectId: string | null
  payload: NotebookAuditPayload
  skipLlm?: boolean
  taxonomyByQuestion?: Map<string, PerQuestionError>
}): Promise<RunBehavioralAuditResult> {
  const taxHint = (qid: string) =>
    params.taxonomyByQuestion?.get(qid)?.error_taxonomy
  const redQs = params.payload.questions.filter((q) => q.zone === "red")
  const yellowQs = params.payload.questions.filter((q) => q.zone === "yellow")
  const greenQs = params.payload.questions.filter((q) => q.zone === "green")
  const explainQs = [...redQs, ...yellowQs]

  const materialByIndex = await prefetchMaterialByQuestion(
    params.userId,
    params.subjectId,
    explainQs
  )

  const baseAudit: BehavioralAudit = {
    performance_summary: params.payload.performance_summary,
    red_zone: redQs.map((q) =>
      buildFallbackItem(
        q,
        materialByIndex.get(q.question_index) ?? [],
        taxHint(q.question_id)
      )
    ),
    yellow_zone: yellowQs.map((q) =>
      buildFallbackItem(
        q,
        materialByIndex.get(q.question_index) ?? [],
        taxHint(q.question_id)
      )
    ),
    green_zone: {
      mastered_indexes: greenQs.map((q) => q.question_index),
      theory_balance:
        greenQs.length > 0
          ? `Questões dominadas: ${greenQs.map((q) => `Q${q.question_index}`).join(", ")}.`
          : "Nenhuma questão na zona verde neste caderno.",
    },
    generated_at: new Date().toISOString(),
    model_used: "rule-based",
  }

  if (params.skipLlm || explainQs.length === 0) {
    return {
      audit: baseAudit,
      modelUsed: "rule-based",
      usedLlm: false,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    }
  }

  const prefs = await getEffectiveReportPreferences(params.userId, params.subjectId)
  const reportsToday = await countReportLlmRunsToday(params.userId)
  if (reportsToday >= prefs.max_llm_explanations_per_day) {
    return {
      audit: baseAudit,
      modelUsed: "rule-based",
      usedLlm: false,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    }
  }

  const input = {
    notebook_name: params.payload.notebook_name,
    subject_name: params.payload.subject_name,
    performance_summary: params.payload.performance_summary,
    red_zone: redQs.map((q) =>
      toLlmItem(
        q,
        materialByIndex.get(q.question_index) ?? [],
        taxHint(q.question_id)
      )
    ),
    yellow_zone: yellowQs.map((q) =>
      toLlmItem(
        q,
        materialByIndex.get(q.question_index) ?? [],
        taxHint(q.question_id)
      )
    ),
    green_zone_summary: greenQs.map((q) => ({
      question_index: q.question_index,
      tec_topic: q.tec_topic,
    })),
  }

  const result = await runAgent({
    agentType: "report",
    userId: params.userId,
    subjectId: params.subjectId,
    systemPrompt: SYSTEM,
    userContent: `Explicação unificada (RAG + auditoria):\n${JSON.stringify(input)}`,
    jsonMode: true,
    maxTokens: 6000,
    model: "gpt-4o",
    metadata: {
      notebook_id: params.payload.notebook_id,
      phase: "unified_explain",
    },
  })

  if (!result.usedLlm || !result.text) {
    return {
      audit: baseAudit,
      modelUsed: "rule-based",
      usedLlm: false,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    }
  }

  try {
    const parsed = JSON.parse(result.text) as {
      red_zone?: LlmZoneItem[]
      yellow_zone?: LlmZoneItem[]
      green_zone?: { mastered_indexes?: number[]; theory_balance?: string }
    }

    const indexToQuestion = new Map(
      params.payload.questions.map((q) => [q.question_index, q])
    )

    function mapItems(
      raw: LlmZoneItem[] | undefined,
      zone: "red" | "yellow"
    ): BehavioralAuditQuestionItem[] {
      const source = zone === "red" ? redQs : yellowQs
      const byIndex = new Map((raw ?? []).map((r) => [r.question_index, r]))

      return source.map((q) => {
        const llm = byIndex.get(q.question_index)
        const fallback = buildFallbackItem(
          q,
          materialByIndex.get(q.question_index) ?? [],
          taxHint(q.question_id)
        )
        if (!llm) return fallback

        const llmCitations = parseCitations(llm.citations)
        const sourceParsed = parseSource(llm.source)
        const citations =
          llmCitations ??
          (sourceParsed !== "ai_generated" ? fallback.citations : undefined)

        return {
          question_index: q.question_index,
          question_id: q.question_id,
          header_label: q.header_label,
          statement_excerpt: q.statement_excerpt.slice(0, 400),
          marked: q.selected_answer,
          answer_key: q.correct_answer,
          user_note: q.user_note || undefined,
          outcome_category: q.outcome_category,
          confidence_level: q.confidence_level,
          feedback: llm.feedback?.trim() || fallback.feedback,
          misconception: llm.misconception,
          error_taxonomy: taxHint(q.question_id) ?? fallback.error_taxonomy,
          source: sourceParsed,
          citations,
        }
      })
    }

    const greenIndexes =
      parsed.green_zone?.mastered_indexes ??
      greenQs.map((q) => q.question_index)

    const audit: BehavioralAudit = {
      performance_summary: params.payload.performance_summary,
      red_zone: mapItems(parsed.red_zone, "red"),
      yellow_zone: mapItems(parsed.yellow_zone, "yellow"),
      green_zone: {
        mastered_indexes: greenIndexes.filter((i) => indexToQuestion.has(i)),
        theory_balance:
          parsed.green_zone?.theory_balance?.trim() ||
          baseAudit.green_zone.theory_balance,
      },
      model_used: result.model,
      generated_at: new Date().toISOString(),
    }

    return {
      audit,
      modelUsed: result.model,
      usedLlm: true,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    }
  } catch {
    return {
      audit: baseAudit,
      modelUsed: "rule-based",
      usedLlm: false,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    }
  }
}

export async function runBehavioralAuditForNotebook(
  notebookId: string,
  userId: string,
  subjectId: string | null,
  options?: {
    skipLlm?: boolean
    payload?: NotebookAuditPayload
    taxonomyByQuestion?: Map<string, PerQuestionError>
  }
): Promise<RunBehavioralAuditResult & { payload: NotebookAuditPayload }> {
  const payload =
    options?.payload ?? (await buildNotebookAuditPayload(notebookId, userId))
  const result = await runBehavioralAuditAgent({
    userId,
    subjectId,
    payload,
    skipLlm: options?.skipLlm,
    taxonomyByQuestion: options?.taxonomyByQuestion,
  })
  await persistAuditInsightsToAttempts(result.audit, payload)
  return { ...result, payload }
}
