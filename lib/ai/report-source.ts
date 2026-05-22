export type ReportSourceVariant = "llm" | "rules"

export function reportSourceFromModel(
  modelUsed: string | null | undefined
): { label: string; variant: ReportSourceVariant } {
  if (!modelUsed || modelUsed === "rule-based") {
    return { label: "Regras (banco de dados)", variant: "rules" }
  }
  return { label: `IA (${modelUsed})`, variant: "llm" }
}
