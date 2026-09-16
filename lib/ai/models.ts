export type AiProvider = "openai" | "anthropic"

export type AiModelOption = {
  id: string
  label: string
}

export const OPENAI_MODELS: AiModelOption[] = [
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4o", label: "GPT-4o" },
]

export const ANTHROPIC_MODELS: AiModelOption[] = [
  { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
  { id: "claude-sonnet-4-0", label: "Claude Sonnet 4" },
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
