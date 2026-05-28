import { aiComplete } from "./ai/client"
import { getUserAiCredentials } from "./ai/user-credentials"
import type { ParsedTecQuestion } from "./question-types"
import type { ParseSource } from "./tec-pdf-parse-merge"

export const IMPORT_LLM_ENABLED =
  process.env.IMPORT_LLM_ENABLED !== "0" && process.env.IMPORT_LLM_ENABLED !== "false"

export type LlmResolveInput = {
  raw_block: string
  candidates: Partial<Record<ParseSource, ParsedTecQuestion | null>>
}

export type LlmResolveResult = {
  question: ParsedTecQuestion
  explanation: string
}

function buildPrompt(input: LlmResolveInput): string {
  const candJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(input.candidates).filter(([, v]) => v != null)
    ),
    null,
    2
  )
  return `Você é um assistente que estrutura questões de concurso extraídas de PDF do TEC Concursos.

Texto bruto do bloco:
"""
${input.raw_block.slice(0, 12000)}
"""

Candidatos dos parsers heurísticos:
${candJson}

Retorne JSON com este formato exato:
{
  "tec_id": number,
  "type": "multiple_choice" | "certo_errado",
  "banca": string,
  "cargo": string,
  "orgao": string,
  "ano": number | null,
  "tec_subject": string,
  "tec_topic": string,
  "statement": string,
  "options": [{"label": string, "text": string}],
  "correct_answer": string,
  "explanation": string
}

Use o gabarito do bloco se estiver explícito. Não invente tec_id diferente do URL no texto.`
}

export async function resolveQuestionWithLlm(
  userId: string,
  input: LlmResolveInput
): Promise<LlmResolveResult> {
  if (!IMPORT_LLM_ENABLED) {
    throw new Error("Resolução por IA desabilitada (IMPORT_LLM_ENABLED)")
  }

  const credentials = await getUserAiCredentials(userId)
  if (!credentials) {
    throw new Error(
      "Configure suas credenciais de IA em Coach para usar a resolução por IA."
    )
  }

  const result = await aiComplete(
    {
      messages: [
        {
          role: "system",
          content:
            "Responda apenas com JSON válido, sem markdown. Estruture questões de concurso brasileiro.",
        },
        { role: "user", content: buildPrompt(input) },
      ],
      jsonMode: credentials.provider === "openai",
      maxTokens: 2500,
    },
    credentials
  )

  if (!result.text) {
    throw new Error("IA não retornou resposta. Verifique suas credenciais.")
  }

  let parsed: Record<string, unknown>
  try {
    const cleaned = result.text.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "")
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error("Resposta da IA não é JSON válido")
  }

  const primary = input.candidates.primary ?? input.candidates.lines ?? input.candidates.strict
  const tec_id = Number(parsed.tec_id) || primary?.tec_id || 0
  const index = primary?.index ?? 1

  const question: ParsedTecQuestion = {
    index,
    tec_id,
    tec_url: `https://www.tecconcursos.com.br/questoes/${tec_id}`,
    type:
      parsed.type === "certo_errado" ? "certo_errado" : "multiple_choice",
    banca: String(parsed.banca ?? primary?.banca ?? ""),
    cargo: String(parsed.cargo ?? primary?.cargo ?? ""),
    orgao: String(parsed.orgao ?? primary?.orgao ?? ""),
    ano:
      typeof parsed.ano === "number"
        ? parsed.ano
        : primary?.ano ?? null,
    tec_subject: String(parsed.tec_subject ?? primary?.tec_subject ?? ""),
    tec_topic: String(parsed.tec_topic ?? primary?.tec_topic ?? ""),
    statement: String(parsed.statement ?? ""),
    options: Array.isArray(parsed.options)
      ? (parsed.options as { label: string; text: string }[]).map((o) => ({
          label: String(o.label).toUpperCase(),
          text: String(o.text),
        }))
      : primary?.options ?? [],
    correct_answer: String(parsed.correct_answer ?? primary?.correct_answer ?? ""),
  }

  return {
    question,
    explanation: String(parsed.explanation ?? "Sugestão gerada pela IA."),
  }
}
