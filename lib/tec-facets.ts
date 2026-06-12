export function normTecKey(value: string | null | undefined): string {
  return (value ?? "").trim()
}

export type FacetQuality = "ok" | "warn" | "hidden"

export function assessTecFacetQuality(value: string | null | undefined): FacetQuality {
  if (!value?.trim()) return "hidden"
  if (/^(?:\d+\)\s*)+\d/.test(value)) return "hidden"
  if (value.length > 220) return "hidden"
  if (/\bConsiderando\b/i.test(value) && value.length > 100) return "hidden"
  if (/\s[a-e]\)\s/i.test(value)) return "hidden"
  if (value.length > 90) return "warn"
  return "ok"
}

export function cleanFacet(value: string | null | undefined): boolean {
  return assessTecFacetQuality(value) === "ok"
}

export type TecTopicPair = {
  tec_subject: string
  tec_topic: string
}

export type TecTaxonomyGroup = {
  tec_subject: string
  topics: string[]
  topic_qualities?: Record<string, FacetQuality>
}

export function buildTecGroupsFromRows(
  rows: { tec_subject?: string | null; tec_topic?: string | null }[],
  opts?: { includeHidden?: boolean; includeWarn?: boolean }
): TecTaxonomyGroup[] {
  const includeHidden = opts?.includeHidden ?? false
  const includeWarn = opts?.includeWarn ?? true

  const groupMap = new Map<string, Map<string, FacetQuality>>()
  for (const r of rows) {
    const sub = normTecKey(r.tec_subject)
    const top = normTecKey(r.tec_topic)
    if (!sub || !top) continue

    const subQ = assessTecFacetQuality(sub)
    const topQ = assessTecFacetQuality(top)
    if (subQ === "hidden" || topQ === "hidden") {
      if (!includeHidden) continue
    } else if (topQ === "warn" && !includeWarn) {
      continue
    }

    const topics = groupMap.get(sub) ?? new Map<string, FacetQuality>()
    const prev = topics.get(top)
    if (!prev || topQ === "ok") topics.set(top, topQ)
    groupMap.set(sub, topics)
  }

  return [...groupMap.entries()]
    .map(([tec_subject, topicsMap]) => ({
      tec_subject,
      topics: [...topicsMap.keys()].sort((a, b) => a.localeCompare(b, "pt-BR")),
      topic_qualities: Object.fromEntries(topicsMap),
    }))
    .sort((a, b) => a.tec_subject.localeCompare(b.tec_subject, "pt-BR"))
}

export function encodeTecTopicPair(subject: string, topic: string): string {
  return `${subject}\0${topic}`
}

export function decodeTecTopicPair(encoded: string): TecTopicPair | null {
  const idx = encoded.indexOf("\0")
  if (idx < 0) return null
  return {
    tec_subject: encoded.slice(0, idx),
    tec_topic: encoded.slice(idx + 1),
  }
}
