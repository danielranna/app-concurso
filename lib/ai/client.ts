import type { UserAiCredentials } from "./user-credentials"

export type AiMessage = { role: "system" | "user"; content: string }

export type AiCompleteOptions = {
  model?: string
  messages: AiMessage[]
  jsonMode?: boolean
  maxTokens?: number
}

export type AiCompleteResult = {
  text: string
  model: string
  tokensIn: number
  tokensOut: number
  costUsdEstimate: number
  provider: "openai" | "anthropic" | "mock"
}

const MINI_COST_PER_1K = 0.00015

function estimateCost(tokensIn: number, tokensOut: number) {
  return ((tokensIn + tokensOut) / 1000) * MINI_COST_PER_1K
}

async function completeOpenAI(
  opts: AiCompleteOptions,
  apiKey: string
): Promise<AiCompleteResult> {
  const model = opts.model ?? "gpt-4o-mini"
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 2000,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI: ${err}`)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? ""
  const tokensIn = data.usage?.prompt_tokens ?? 0
  const tokensOut = data.usage?.completion_tokens ?? 0

  return {
    text,
    model,
    tokensIn,
    tokensOut,
    costUsdEstimate: estimateCost(tokensIn, tokensOut),
    provider: "openai",
  }
}

async function completeAnthropic(
  opts: AiCompleteOptions,
  apiKey: string
): Promise<AiCompleteResult> {
  const model = opts.model ?? "claude-3-5-haiku-latest"
  const system = opts.messages.find((m) => m.role === "system")?.content ?? ""
  const userMsgs = opts.messages.filter((m) => m.role === "user")

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 2000,
      system,
      messages: userMsgs.map((m) => ({ role: "user", content: m.content })),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic: ${err}`)
  }

  const data = await res.json()
  const text =
    data.content?.find((c: { type: string }) => c.type === "text")?.text ?? ""
  const tokensIn = data.usage?.input_tokens ?? 0
  const tokensOut = data.usage?.output_tokens ?? 0

  return {
    text,
    model,
    tokensIn,
    tokensOut,
    costUsdEstimate: estimateCost(tokensIn, tokensOut),
    provider: "anthropic",
  }
}

/** Completa com a chave do usuário (BYOK). Sem credenciais → mock vazio. */
export async function aiComplete(
  opts: AiCompleteOptions,
  credentials?: UserAiCredentials | null
): Promise<AiCompleteResult> {
  if (credentials?.provider === "openai") {
    return completeOpenAI(opts, credentials.apiKey)
  }
  if (credentials?.provider === "anthropic") {
    return completeAnthropic(opts, credentials.apiKey)
  }
  return {
    text: "",
    model: "mock",
    tokensIn: 0,
    tokensOut: 0,
    costUsdEstimate: 0,
    provider: "mock",
  }
}
