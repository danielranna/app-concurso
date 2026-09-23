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

const SYSTEM_PROMPT = `Você é um elaborador de questões CERTO/ERRADO (estilo CESPE) cujo objetivo é CONFRONTAR o erro do aluno.

Entrada: questão original + o que o aluno marcou + (quando houver) o motivo/diagnóstico do erro.
Saída: UMA assertiva nova, autocontida, que cobre o ponto que o aluno errou.

Objetivo pedagógico:
- Extrair o CONCEITO que o aluno confundiu (ex.: ISS não integra a própria base de cálculo; política de governança é colaborativa; etc.).
- Montar uma frase C/E que force o aluno a decidir se aquele conceito está certo ou errado — sem precisar abrir a questão original.

Regras OBRIGATÓRIAS da assertiva (statement):
1. FRASE COMPLETA e AUTOCONTIDA: sujeito explícito + predicado. Quem lê só a assertiva (sem enunciado original) consegue julgar.
2. Nomeie o instituto/tributo/órgão/conceito no próprio texto. NUNCA use só pronome ("sua", "ele", "isso") sem antecedente na mesma frase.
3. PROIBIDO:
   - Fragmentos / só substantivos.
   - Prefácios ("Julgue…", "É correto afirmar que…").
   - Remeter a "itens I e II", "alternativas", "acima", "abaixo", "o enunciado", "a questão".
   - Copiar a questão original (personagens, números, estrutura de múltipla escolha).
   - Enunciados de cálculo/múltipla escolha cortados no meio ("…será igual a", "…é igual a", "…corresponde a") SEM afirmar o valor/resultado.
   - Perguntas abertas ou frases que pedem preenchimento (não são C/E).
4. Em questões de cálculo: NÃO cole o enunciado. Extraia o ponto (conceito OU um resultado completo).
   - RUIM: "…se o governo impuser imposto de 250… a quantidade consumida… será igual a"
   - BOM: "Com Qd = 1.000 − 3Pd, Qs = 2Ps e imposto específico de 250 por unidade, a quantidade de equilíbrio após o imposto é 200."
   - BOM (conceitual): "A incidência de imposto específico sobre cada unidade vendida reduz a quantidade de equilíbrio do mercado."
5. Pode (e deve) usar o motivo do erro do aluno para mirar a confusão — mas a assertiva testa o CONCEITO/resultado, não pergunta "por que você errou".
6. NÃO invente artigos, súmulas, percentuais ou regras que não estejam na base fornecida. Se a base for fraca → ok=false.
7. knowledge_summary: 1 linha do conceito (sem nome de matéria do edital).
8. explanation: justifica o gabarito com o conceito correto (pode mencionar a confusão típica).

Exemplos:
- RUIM: "É correto afirmar que não integrará sua própria base de cálculo."
- BOM: "O ISS não integra a sua própria base de cálculo."
- RUIM: "É correto afirmar que Apenas os itens I e II estão certos."
- BOM: "A definição de políticas de governança de dados deve ser exclusiva da alta administração, sem participação das equipes técnicas."
- RUIM: enunciado longo de oferta/demanda terminando em "será igual a".
- BOM: assertiva com o resultado numérico completo ou o conceito de incidência tributária no equilíbrio.

Responda APENAS JSON:
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

function normalizeStatement(raw: string): string {
  return raw
    .replace(/^julgue\s+(o\s+)?(próximo\s+)?(item|assertiva|texto)[^.]*\.\s*/i, "")
    .replace(/^julgue\s+(a\s+seguinte\s+)?(afirmação|item|assertiva)\s*:\s*/i, "")
    .replace(/^é\s+correto\s+afirmar\s+que\s+/i, "")
    .trim()
}

/** Rejeita fragmentos e frases que dependem de contexto externo. */
export function isCompleteCeStatement(statement: string): boolean {
  const s = normalizeStatement(statement)
  if (s.length < 45) return false

  // Pergunta aberta / incompleta
  if (/\?\s*$/.test(s)) return false

  // Enunciado de múltipla escolha cortado (pede valor sem afirmar)
  if (
    /\b(será|é|fica|resulta|corresponde|equivale|vale)\s+igual\s+a\s*\.?$/i.test(s) ||
    /\b(igual|igualada)\s+a\s*\.?$/i.test(s) ||
    /\b(corresponde|equivale|resulta)\s+a\s*\.?$/i.test(s) ||
    /\b(quantidade|valor|preço|resultado)\s+(consumida|ofertada|de equilíbrio)?\s*(desse bem)?,?\s*(considerad[oa].*)?(será|é)\s+igual\s+a\s*\.?$/i.test(
      s
    ) ||
    /:\s*$/.test(s) ||
    /\ba\s*$/i.test(s)
  ) {
    return false
  }

  // Remissões a itens/alternativas/enunciado — injulgáveis sozinhas
  if (
    /\b(itens?|alternativas?)\s+[IVXLC0-9]/i.test(s) ||
    /\b(apenas|somente)\s+(os\s+)?itens?\b/i.test(s) ||
    /\b(acima|abaixo|seguinte|anterior|mencionad[oa]s?|referid[oa]s?|enunciado|questão)\b/i.test(
      s
    )
  ) {
    return false
  }

  // Pronome / sujeito oculto no início
  if (
    /^(não\s+)?(integrará|será|deve|devem|pode|podem|possui|possuem)\b/i.test(s) ||
    /^(sua|seu|suas|seus|ele|ela|eles|elas|isso|isto|aquilo)\b/i.test(s)
  ) {
    return false
  }

  // Stem típico de MCQ colado ("Nessa situação hipotética… será igual a")
  if (
    /\bnessa situação hipotética\b/i.test(s) &&
    /\bserá igual a\b/i.test(s) &&
    !/\bserá igual a\s+\d/i.test(s)
  ) {
    return false
  }

  const hasVerbLike =
    /\b(é|são|está|estão|deve|devem|pode|podem|não|possui|possuem|constitui|configura|compete|cabe|inclui|exclui|trata|refere|aplica|aplica-se|ocorre|ocorrem|exige|exigem|veda|permite|integra|integram|integrará|compõe|compõem|reduz|aumenta)\b/i.test(
      s
    )
  const wordCount = s.split(/\s+/).filter(Boolean).length
  const hasConcreteNoun =
    /\b[A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõç]{2,}\b/.test(s) ||
    /\b(iss|icms|ipi|ir|csll|pis|cofins|cf\/|lei|decreto|súmula|stf|stj|administração|tributo|base de cálculo|governança|dados|ato|contrato|servidor|imposto|oferta|demanda|equilíbrio|mercado|quantidade)\b/i.test(
      s
    )

  return hasVerbLike && wordCount >= 10 && hasConcreteNoun
}

/** Detecta cópia/cola do enunciado (ex.: stem de cálculo terminando em "será igual a"). */
function isNearCopyOfOriginal(statement: string, original: string): boolean {
  const a = normalizeStatement(statement).toLowerCase().replace(/\s+/g, " ")
  const b = String(original ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
  if (a.length < 60 || b.length < 60) return false
  if (b.includes(a) || a.includes(b.slice(0, Math.min(b.length, a.length)))) {
    return true
  }
  // Overlap de prefixo longo
  const prefixLen = Math.min(120, a.length, b.length)
  if (prefixLen >= 80 && a.slice(0, prefixLen) === b.slice(0, prefixLen)) {
    return true
  }
  return false
}

function collectErrorContext(params: {
  errorDetail?: Record<string, unknown> | null
  motivo?: string | null
  errorText?: string | null
  explanation?: string | null
}): string[] {
  const bits: string[] = []
  const d = params.errorDetail ?? {}

  if (params.motivo?.trim()) {
    bits.push(`Motivo informado pelo aluno: ${params.motivo.trim()}`)
  }
  if (params.errorText?.trim()) {
    bits.push(`Registro do erro: ${params.errorText.trim()}`)
  }
  if (params.explanation?.trim()) {
    bits.push(`Explicação já salva no erro: ${params.explanation.trim()}`)
  }

  for (const key of [
    "misconception",
    "specific_mistake",
    "feedback_detailed",
    "feedback",
    "root_cause",
    "why_wrong",
  ] as const) {
    const v = d[key]
    if (typeof v === "string" && v.trim()) {
      bits.push(`${key}: ${v.trim()}`)
    }
  }

  return bits
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
  motivo?: string | null
  errorText?: string | null
  explanation?: string | null
}): Promise<ErrorReviewQuestionResult> {
  const optionsText =
    params.options?.map((o) => `${o.label}) ${o.text}`).join("\n") ?? ""

  const detailBits = collectErrorContext({
    errorDetail: params.errorDetail,
    motivo: params.motivo,
    errorText: params.errorText,
    explanation: params.explanation,
  })

  const userContent = [
    "Monte UMA assertiva C/E que CONFRONTE o erro do aluno.",
    "A assertiva deve ser autocontida (sujeito + conceito/resultado nomeados).",
    "NÃO copie o enunciado. NÃO termine em 'será igual a' sem o valor. Sem 'É correto afirmar que…' e sem itens I/II.",
    `Tipo original: ${params.originalType}`,
    `Enunciado original:\n${params.originalStatement}`,
    optionsText ? `Alternativas:\n${optionsText}` : "",
    `Gabarito: ${params.correctAnswer}`,
    `Resposta do aluno: ${params.selectedAnswer || "(não informada)"}`,
    detailBits.length
      ? `Por que o aluno errou / diagnóstico:\n${detailBits.join("\n")}`
      : "Não há motivo/diagnóstico explícito — extraia o conceito central da questão e do gabarito.",
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
      reason:
        "Assertiva gerada incompleta ou dependente de contexto (itens/pronomes/fragmento/enunciado cortado).",
    }
  }

  // Bloqueia cópia quase literal do enunciado original (comum em cálculo/MCQ)
  if (isNearCopyOfOriginal(statement, params.originalStatement)) {
    return {
      ok: false,
      reason: "Assertiva parece cópia do enunciado original; precisa ser C/E nova.",
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

/**
 * Fallback sem LLM — só para questões já C/E com enunciado autocontido.
 * NÃO embrulha alternativas de múltipla escolha em "É correto afirmar que…"
 * (isso gerava slop tipo "itens I e II" / "não integrará sua própria…").
 */
export function buildFallbackErrorReviewQuestion(params: {
  originalStatement: string
  originalType: string
  correctAnswer: string
  options?: { label: string; text: string }[]
  errorDetail?: Record<string, unknown> | null
  tecTopic?: string | null
  motivo?: string | null
}): ErrorReviewQuestionResult {
  const correct = String(params.correctAnswer ?? "").trim()
  const statementRaw = String(params.originalStatement ?? "").trim()
  if (!statementRaw || !correct) {
    return { ok: false, reason: "Sem enunciado/gabarito para fallback." }
  }

  // Só reaproveita enunciado C/E original se já for julgável sozinho
  if (params.originalType === "certo_errado") {
    const c = correct.toLowerCase()
    const answer: "Certo" | "Errado" =
      c.startsWith("e") || c === "errado" ? "Errado" : "Certo"
    const statement = normalizeStatement(statementRaw)
    if (!isCompleteCeStatement(statement)) {
      return {
        ok: false,
        reason: "Enunciado original não é assertiva autocontida para fallback.",
      }
    }

    const fromDetail =
      (params.errorDetail?.feedback_detailed as string) ||
      (params.errorDetail?.misconception as string) ||
      params.motivo ||
      ""
    const explanation =
      String(fromDetail).trim() ||
      `Gabarito: ${answer}. Revise o conceito cobrado na questão original.`
    const summary =
      String(
        params.errorDetail?.misconception ||
          params.errorDetail?.specific_mistake ||
          ""
      ).trim().slice(0, 100) || `Conceito revisado: ${statement.slice(0, 60)}…`
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

  // Múltipla escolha: sem LLM não inventamos C/E a partir de alternativa solta
  return {
    ok: false,
    reason:
      "Fallback recusou múltipla escolha sem IA (evita assertivas sem sujeito/itens I-II).",
  }
}
