/** Recorta trechos do PDF onde costumam estar pesos, pontos e distribuição da prova. */
export function pickEditalCriteriaSnippet(fullText: string, maxChars = 22_000): string {
  const text = fullText.replace(/\r\n/g, "\n")
  const lower = text.toLowerCase()

  const anchors = [
    "critérios de avaliação",
    "criterios de avaliacao",
    "critério de avaliação",
    "da avaliação",
    "avaliação e",
    "pontuação",
    "distribuição das questões",
    "distribuicao das questoes",
    "prova objetiva",
    "provas objetivas",
    "peso da prova",
    "nota final",
    "classificação final",
    "quadro de pontos",
    "tabela de pontos",
  ]

  const slices: string[] = []
  const used = new Set<number>()

  for (const anchor of anchors) {
    let idx = 0
    while (idx < lower.length) {
      const found = lower.indexOf(anchor, idx)
      if (found < 0) break
      if (!used.has(found)) {
        used.add(found)
        const start = Math.max(0, found - 800)
        const end = Math.min(text.length, found + 4500)
        slices.push(text.slice(start, end))
      }
      idx = found + anchor.length
    }
  }

  if (!slices.length) {
    return text.slice(0, maxChars)
  }

  const merged = [...new Set(slices)].join("\n\n---\n\n")
  return merged.slice(0, maxChars)
}
