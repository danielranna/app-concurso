/** Normalização determinística de conhecimento (v1 — sem fuzzy). */
export function normalizeKnowledgeKey(raw: string): string {
  const base = (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

  if (!base) return ""

  const tokens = [...new Set(base.split(/\s+/).filter(Boolean))].sort()
  return tokens.join("_")
}
