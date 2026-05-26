import type {
  BehavioralAudit,
  BehavioralAuditQuestionItem,
  ErrorTaxonomy,
  PerQuestionError,
} from "../../coach-types"
import { runAgent } from "../run-agent"
import { countReportLlmRunsToday } from "../report-helpers"
import { getEffectiveReportPreferences } from "../context-builder"
import {
  buildNotebookAuditPayload,
  type NotebookAuditPayload,
  type NotebookAuditQuestion,
} from "../notebook-audit-payload"
import { supabaseServer } from "../../supabase-server"

const VALID_TAXONOMIES = new Set<string>([
  "desatencao",
  "pegadinha_interpretacao",
  "falta_compreensao",
  "calculo_procedimento",
  "falta_memorizacao",
  "nao_aplicavel",
])

const SYSTEM = `Você é o auditor comportamental de um caderno de questões de concurso (Fase 2).
Analise CADA questão das zonas vermelha e amarela com precisão cirúrgica.

REGRAS OBRIGATÓRIAS:
1. Se existir user_note, o feedback DEVE começar corrigindo a lógica expressa na nota do aluno (cite o equívoco).
2. Proibido texto genérico de apostila quando a nota ou o enunciado revelam o erro específico.
3. Mencione conceitos exatos do enunciado (ex.: supremacia/indisponibilidade, não só "princípios genéricos").
4. Formato: explique por que Marcada vs Gabarito; se acertou por chute ou lógica errada, diga explicitamente.
5. Português (BR), tom de professor de concurso, técnico e direto.

Responda JSON:
{
  "red_zone": [{
    "question_index": 1,
    "feedback": "texto detalhado",
    "misconception": "equívoco em 1 frase",
    "error_taxonomy": "falta_compreensao|falta_memorizacao|pegadinha_interpretacao|desatencao|calculo_procedimento"
  }],
  "yellow_zone": [{ "question_index": 2, "feedback": "...", "misconception": "..." }],
  "green_zone": {
    "mastered_indexes": [1, 3, 5],
    "theory_balance": "parágrafo sobre domínio consolidado citando questões Qn quando relevante"
  }
}

Inclua TODAS as questões red e yellow do input (mesmos question_index).`

function toLlmItem(q: NotebookAuditQuestion) {
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
  }
}

function buildFallbackItem(q: NotebookAuditQuestion): BehavioralAuditQuestionItem {
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
  }
}

function parseTaxonomy(raw: string | undefined): ErrorTaxonomy | undefined {
  if (!raw || !VALID_TAXONOMIES.has(raw)) return undefined
  return raw as ErrorTaxonomy
}

export function mergeBehavioralAuditIntoErrors(
  perQuestionErrors: PerQuestionError[],
  audit: BehavioralAudit,
  payload: NotebookAuditPayload
): PerQuestionError[] {
  const byQid = new Map(perQuestionErrors.map((e) => [e.question_id, { ...e }]))
  const auditItems = [...audit.red_zone, ...audit.yellow_zone]

  for (const item of auditItems) {
    const q = payload.questions.find((x) => x.question_id === item.question_id)
    const zone = q?.zone ?? "red"
    const existing = byQid.get(item.question_id)

    if (existing) {
      existing.feedback_detailed = item.feedback
      existing.specific_mistake = item.misconception ?? existing.specific_mistake
      existing.misconception = item.misconception
      existing.question_index = item.question_index
      existing.header_label = item.header_label
      existing.statement_excerpt = item.statement_excerpt
      existing.marked_answer = item.marked
      existing.correct_answer = item.answer_key
      existing.user_note = item.user_note
      existing.zone = zone
      existing.outcome_category = item.outcome_category
      existing.confidence_level = item.confidence_level
      if (item.error_taxonomy) existing.error_taxonomy = item.error_taxonomy
    } else if (zone === "yellow") {
      byQid.set(item.question_id, {
        question_id: item.question_id,
        tec_id: q?.tec_id,
        tec_topic: q?.tec_topic,
        error_taxonomy: item.error_taxonomy ?? "pegadinha_interpretacao",
        feedback_detailed: item.feedback,
        specific_mistake: item.misconception,
        misconception: item.misconception,
        question_index: item.question_index,
        header_label: item.header_label,
        statement_excerpt: item.statement_excerpt,
        marked_answer: item.marked,
        correct_answer: item.answer_key,
        user_note: item.user_note,
        zone: "yellow",
        outcome_category: item.outcome_category,
        confidence_level: item.confidence_level,
      })
    }
  }

  return [...byQid.values()].sort(
    (a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)
  )
}

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
          behavioral_audit: true,
        },
        ...(item.error_taxonomy ? { error_taxonomy: item.error_taxonomy } : {}),
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

export async function runBehavioralAuditAgent(params: {
  userId: string
  subjectId: string | null
  payload: NotebookAuditPayload
  skipLlm?: boolean
}): Promise<RunBehavioralAuditResult> {
  const redQs = params.payload.questions.filter((q) => q.zone === "red")
  const yellowQs = params.payload.questions.filter((q) => q.zone === "yellow")
  const greenQs = params.payload.questions.filter((q) => q.zone === "green")

  const baseAudit: BehavioralAudit = {
    performance_summary: params.payload.performance_summary,
    red_zone: redQs.map(buildFallbackItem),
    yellow_zone: yellowQs.map(buildFallbackItem),
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

  if (params.skipLlm || (redQs.length === 0 && yellowQs.length === 0)) {
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
    red_zone: redQs.map(toLlmItem),
    yellow_zone: yellowQs.map(toLlmItem),
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
    userContent: `Auditoria comportamental:\n${JSON.stringify(input)}`,
    jsonMode: true,
    maxTokens: 6000,
    model: "gpt-4o",
    metadata: {
      notebook_id: params.payload.notebook_id,
      phase: "behavioral_audit",
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
      red_zone?: {
        question_index: number
        feedback: string
        misconception?: string
        error_taxonomy?: string
      }[]
      yellow_zone?: {
        question_index: number
        feedback: string
        misconception?: string
        error_taxonomy?: string
      }[]
      green_zone?: { mastered_indexes?: number[]; theory_balance?: string }
    }

    const indexToQuestion = new Map(
      params.payload.questions.map((q) => [q.question_index, q])
    )

    function mapItems(
      raw: typeof parsed.red_zone,
      zone: "red" | "yellow"
    ): BehavioralAuditQuestionItem[] {
      const source = zone === "red" ? redQs : yellowQs
      const byIndex = new Map((raw ?? []).map((r) => [r.question_index, r]))

      return source.map((q) => {
        const llm = byIndex.get(q.question_index)
        const fallback = buildFallbackItem(q)
        if (!llm) return fallback
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
          error_taxonomy: parseTaxonomy(llm.error_taxonomy),
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
  options?: { skipLlm?: boolean }
): Promise<RunBehavioralAuditResult & { payload: NotebookAuditPayload }> {
  const payload = await buildNotebookAuditPayload(notebookId, userId)
  const result = await runBehavioralAuditAgent({
    userId,
    subjectId,
    payload,
    skipLlm: options?.skipLlm,
  })
  await persistAuditInsightsToAttempts(result.audit, payload)
  return { ...result, payload }
}
