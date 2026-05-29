export type QuestionOption = { label: string; text: string }

export function resolveOptionText(
  label: string | null | undefined,
  options: QuestionOption[]
): string | null {
  if (!label || label === "—") return null
  const normalized = label.trim().toUpperCase()
  const match = options.find((o) => o.label.trim().toUpperCase() === normalized)
  return match?.text?.trim() || null
}
