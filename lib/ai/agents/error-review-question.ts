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

const SYSTEM_PROMPT = `Você é um elaborador de questões de concurso público (CERTO/ERRADO).

Tarefa: a partir de uma questão que o aluno ERROU, identificar o CONHECIMENTO CENTRAL e criar UMA nova assertiva certo/errado que teste o MESMO conhecimento em OUTRO contexto.

Regras obrigatórias:
1. NÃO parafrasear a questão original. NÃO copiar frase, personagens, números, alternativas ou estrutura.
2. Variar contexto, redação e forma de cobrança.
3. Preservar rigorosamente o ponto jurídico/conceitual cobrado. NÃO inventar artigos, súmulas, exceções ou regras.
4. Se não houver informação suficiente para uma assertiva confiável, responda JSON com ok=false e reason.
5. Formato SEMPRE certo/errado (gabarito "Certo" ou "Errado").
6. knowledge_summary: frase curta do conceito (ex.: "diferença entre anulação e revogação de atos administrativos").
7. explanation: explicação jurídica do gabarito (NÃO é o motivo do erro do aluno).

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
    detailBits.length ? `Contexto do erro (diagnóstico IA, se houver):\n${detailBits.join("\n")}` : "",
    "Gere a assertiva C/E conforme as regras.",
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
    maxTokens: 1200,
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
  const statement = String(parsed.statement ?? "").trim()
  const explanation = String(parsed.explanation ?? "").trim()
  const answerRaw = String(parsed.answer ?? "").trim().toLowerCase()
  const answer: "Certo" | "Errado" =
    answerRaw === "errado" || answerRaw === "e" ? "Errado" : "Certo"

  if (!summary || !statement || !explanation) {
    return { ok: false, reason: "Campos obrigatórios ausentes na geração." }
  }

  // Evitar cópia óbvia do enunciado original
  const origNorm = params.originalStatement.slice(0, 80).toLowerCase()
  if (
    statement.toLowerCase().includes(origNorm) &&
    origNorm.length > 40
  ) {
    return {
      ok: false,
      reason: "Assertiva muito similar à original — não persistida.",
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
