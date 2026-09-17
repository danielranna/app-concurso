import { runAgent } from "../run-agent"
import { normalizeKnowledgeKey } from "../../knowledge-key"

export type ErrorReviewQuestionResult = {
  ok: boolean
  reason?: string
  knowledge_summary?: string
  knowledge_key?: string
  statement?: string
  answer?: "Certo" | "Errado"
  explanation?: string
}

const SYSTEM_PROMPT = `Você é um elaborador de questões de concurso público no formato CERTO/ERRADO (estilo CESPE/Cebraspe).

Tarefa: a partir de uma questão que o aluno ERROU, identificar o CONHECIMENTO CENTRAL e criar UMA nova assertiva certo/errado que teste o MESMO conhecimento em OUTRO contexto.

Regras obrigatórias:
1. A assertiva (statement) DEVE ser uma FRASE COMPLETA, afirmativa, com sujeito + predicado, julgável como verdadeira ou falsa.
   - BOM: "No âmbito da qualidade de dados, controles de qualidade devem ser incorporados aos processos de captura e transformação."
   - RUIM: "incorporação de controles de qualidade nos processos de captura" (fragmento / só substantivo).
   - RUIM: "Julgue a seguinte afirmação: X" quando X não for frase completa.
2. NÃO use prefácios como "Julgue o item", "Julgue a seguinte afirmação". Vá direto à assertiva.
3. NÃO parafrasear a questão original. NÃO copiar frase, personagens, números, alternativas ou estrutura.
4. Variar contexto, redação e forma de cobrança.
5. Preservar rigorosamente o ponto jurídico/conceitual cobrado. NÃO inventar artigos, súmulas, exceções ou regras.
6. Se a base for fraca, responda ok=false — NÃO invente.
7. knowledge_summary: conceito em 1 linha curta (sem nome de matéria/assunto do edital).
8. explanation: justifica o gabarito com o conceito (não o motivo psicológico do erro do aluno).

Responda APENAS JSON válido:
{
  "ok": true,
  "knowledge_summary": string,
  "statement": string,
  "answer": "Certo" | "Errado",
  "explanation": string
}
ou
{ "ok": false, "reason": string }`

function parseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      return JSON.parse(m[0]) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

/** Rejeita fragmentos / só substantivos que não dão para julgar C/E. */
export function isCompleteCeStatement(statement: string): boolean {
  const s = statement
    .replace(/^julgue\s+(a\s+seguinte\s+)?(afirmação|item|assertiva)\s*:\s*/i, "")
    .trim()
  if (s.length < 40) return false
  // Precisa parecer frase (espaços + verbo comum em PT) ou terminar com ponto
  const hasVerbLike =
    /\b(é|são|está|estão|deve|devem|pode|podem|não|possui|possuem|constitui|configura|compete|cabe|inclui|exclui|trata|refere|aplica|aplica-se|ocorre|ocorrem|exige|exigem|veda|permite)\b/i.test(
      s
    )
  const wordCount = s.split(/\s+/).filter(Boolean).length
  return hasVerbLike && wordCount >= 8
}

function normalizeStatement(raw: string): string {
  return raw
    .replace(/^julgue\s+(o\s+)?(próximo\s+)?(item|assertiva|texto)[^.]*\.\s*/i, "")
    .replace(/^julgue\s+(a\s+seguinte\s+)?(afirmação|item|assertiva)\s*:\s*/i, "")
    .trim()
}

export async function generateErrorReviewQuestion(params: {
  userId: string
  subjectId?: string | null
  originalStatement: string
  originalType: string
  correctAnswer: string
  selectedAnswer: string
  options?: { label: string; text: string }[]
  errorDetail?: Record<string, unknown> | null
}): Promise<ErrorReviewQuestionResult> {
  const optionsText =
    params.options?.map((o) => `${o.label}) ${o.text}`).join("\n") ?? ""

  const detailBits: string[] = []
  if (params.errorDetail?.misconception) {
    detailBits.push(`Misconception: ${String(params.errorDetail.misconception)}`)
  }
  if (params.errorDetail?.specific_mistake) {
    detailBits.push(`Erro específico: ${String(params.errorDetail.specific_mistake)}`)
  }
  if (params.errorDetail?.feedback_detailed) {
    detailBits.push(`Feedback: ${String(params.errorDetail.feedback_detailed)}`)
  }

  const userContent = [
    `Tipo original: ${params.originalType}`,
    `Enunciado original:\n${params.originalStatement}`,
    optionsText ? `Alternativas:\n${optionsText}` : "",
    `Gabarito: ${params.correctAnswer}`,
    `Resposta do aluno: ${params.selectedAnswer}`,
    detailBits.length
      ? `Contexto do erro (diagnóstico IA, se houver):\n${detailBits.join("\n")}`
      : "",
    "Gere UMA assertiva C/E completa (frase com sujeito e predicado), sem prefácio 'Julgue…'.",
  ]
    .filter(Boolean)
    .join("\n\n")

  const result = await runAgent({
    agentType: "error_review_question",
    userId: params.userId,
    subjectId: params.subjectId,
    systemPrompt: SYSTEM_PROMPT,
    userContent,
    jsonMode: true,
    maxTokens: 1400,
    metadata: { feature: "error_review_ce" },
  })

  if (!result.usedLlm || !result.text.trim()) {
    return {
      ok: false,
      reason: "Sem credenciais de IA ou resposta vazia — erro permanece no caderno.",
    }
  }

  const parsed = parseJson(result.text)
  if (!parsed) {
    return { ok: false, reason: "Resposta da IA inválida (JSON)." }
  }

  if (parsed.ok === false) {
    return {
      ok: false,
      reason: String(parsed.reason ?? "Base insuficiente para gerar assertiva."),
    }
  }

  const summary = String(parsed.knowledge_summary ?? "").trim()
  const statement = normalizeStatement(String(parsed.statement ?? ""))
  const explanation = String(parsed.explanation ?? "").trim()
  const answerRaw = String(parsed.answer ?? "").trim().toLowerCase()
  const answer: "Certo" | "Errado" =
    answerRaw === "errado" || answerRaw === "e" ? "Errado" : "Certo"

  if (!summary || !statement || !explanation) {
    return { ok: false, reason: "Campos obrigatórios ausentes na geração." }
  }

  if (!isCompleteCeStatement(statement)) {
    return {
      ok: false,
      reason: "Assertiva gerada incompleta (não é frase julgável).",
    }
  }

  const knowledge_key = normalizeKnowledgeKey(summary)
  if (!knowledge_key) {
    return { ok: false, reason: "knowledge_key vazia após normalização." }
  }

  return {
    ok: true,
    knowledge_summary: summary,
    knowledge_key,
    statement,
    answer,
    explanation,
  }
}

/** Fallback sem LLM: monta C/E a partir da questão original para não travar a revisão. */
export function buildFallbackErrorReviewQuestion(params: {
  originalStatement: string
  originalType: string
  correctAnswer: string
  options?: { label: string; text: string }[]
  errorDetail?: Record<string, unknown> | null
  tecTopic?: string | null
}): ErrorReviewQuestionResult {
  const correct = String(params.correctAnswer ?? "").trim()
  const statementRaw = String(params.originalStatement ?? "").trim()
  if (!statementRaw || !correct) {
    return { ok: false, reason: "Sem enunciado/gabarito para fallback." }
  }

  let answer: "Certo" | "Errado" = "Certo"
  let statement = ""

  if (params.originalType === "certo_errado") {
    const c = correct.toLowerCase()
    answer = c.startsWith("e") || c === "errado" ? "Errado" : "Certo"
    statement = normalizeStatement(statementRaw)
    if (!statement || statement.length < 20) statement = statementRaw
  } else {
    const opt = params.options?.find(
      (o) =>
        o.label.toUpperCase() === correct.toUpperCase() ||
        o.text.trim().toLowerCase() === correct.toLowerCase()
    )
    const optText = (opt?.text?.trim() || correct).replace(/^[A-Ea-e]\)\s*/, "")
    // Transforma alternativa (muitas vezes fragmento) em frase julgável.
    if (isCompleteCeStatement(optText)) {
      statement = normalizeStatement(optText)
      answer = "Certo"
    } else {
      statement = `É correto afirmar que ${optText.replace(/^que\s+/i, "").replace(/\.$/, "")}.`
      answer = "Certo"
    }
  }

  if (!isCompleteCeStatement(statement)) {
    // Último recurso: recorta enunciado original se for C/E-like
    const fromOriginal = normalizeStatement(statementRaw)
    if (isCompleteCeStatement(fromOriginal)) {
      statement = fromOriginal
    } else {
      return {
        ok: false,
        reason: "Fallback não conseguiu montar assertiva completa.",
      }
    }
  }

  const fromDetail =
    (params.errorDetail?.feedback_detailed as string) ||
    (params.errorDetail?.misconception as string) ||
    ""
  const explanation =
    String(fromDetail).trim() ||
    `Gabarito: ${answer}. Revise o conceito cobrado na questão original.`

  // NÃO usar tecTopic como summary (vira dica de assunto na UI).
  const summary =
    String(fromDetail).trim().slice(0, 100) ||
    `Conceito revisado: ${statement.slice(0, 60)}…`
  const knowledge_key = normalizeKnowledgeKey(summary)
  if (!knowledge_key) {
    return { ok: false, reason: "knowledge_key vazia no fallback." }
  }

  return {
    ok: true,
    knowledge_summary: summary,
    knowledge_key,
    statement,
    answer,
    explanation,
  }
}
