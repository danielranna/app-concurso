export type AiProvider = "openai" | "anthropic"

export type AiModelOption = {
  id: string
  label: string
}

/** Modelos OpenAI compatíveis com /v1/chat/completions (texto). */
export const OPENAI_MODELS: AiModelOption[] = [
  { id: "gpt-4o-mini", label: "GPT-4o mini (rápido · barato)" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 nano (mais barato)" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-5-nano", label: "GPT-5 nano" },
  { id: "gpt-5-mini", label: "GPT-5 mini" },
  { id: "gpt-5", label: "GPT-5" },
  { id: "o4-mini", label: "o4-mini (raciocínio)" },
  { id: "o3-mini", label: "o3-mini (raciocínio)" },
]

/** Modelos Anthropic via Messages API. */
export const ANTHROPIC_MODELS: AiModelOption[] = [
  { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (rápido · barato)" },
  { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
  { id: "claude-sonnet-4-0", label: "Claude Sonnet 4" },
  { id: "claude-opus-4-0", label: "Claude Opus 4" },
]

export function modelsForProvider(provider: AiProvider): AiModelOption[] {
  return provider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS
}

export function defaultModelForProvider(provider: AiProvider): string {
  return modelsForProvider(provider)[0].id
}

/** Resolve modelo salvo (ou inválido) para um id da allowlist do provedor. */
export function resolvePreferredModel(
  provider: AiProvider,
  value: string | null | undefined
): string {
  const allowed = modelsForProvider(provider)
  if (value && allowed.some((m) => m.id === value)) return value
  return defaultModelForProvider(provider)
}

export function isAllowedModel(
  provider: AiProvider,
  model: string
): boolean {
  return modelsForProvider(provider).some((m) => m.id === model)
}

/** o-series costuma exigir max_completion_tokens em vez de max_tokens. */
export function isOpenAiReasoningModel(model: string): boolean {
  return /^(o[0-9]|o4)/i.test(model)
}
