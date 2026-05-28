/** Artigos/preposições de uma letra — não juntar com a palavra seguinte. */
const PT_SINGLE_WORD = new Set([
  "a",
  "à",
  "e",
  "é",
  "o",
  "ó",
  "ô",
  "ú",
  "à",
  "ê",
  "i",
  "u",
])

/** Maiúscula isolada + espaço + palavra (≥2 letras): "P ara" → "Para" (exceto O/A artigos). */
const UPPER_FRAG_RE = /([A-ZÁÉÍÓÚÃÕÇ])\s+(?=[a-záéíóúãõç]{2,})/g

const PT_SINGLE_UPPER_KEEP_SPACE = new Set([
  "A",
  "E",
  "I",
  "O",
  "V",
  "Á",
  "É",
  "Ó",
  "Ú",
])

/**
 * Consoante (ou h) isolada + espaço + palavra: "f uncional" → "funcional".
 * Vogais isoladas (a, e, o…) ficam de fora via PT_SINGLE_WORD.
 */
const LOWER_CONSONANT_FRAG_RE =
  /\b([b-df-hj-np-tv-zçB-DF-HJ-NP-TV-ZÇ])\s+(?=[a-záéíóúãõç]{2,})/g

function repairLine(line: string): string {
  let out = line.replace(UPPER_FRAG_RE, (match, char: string, offset: number) => {
    if (PT_SINGLE_UPPER_KEEP_SPACE.has(char)) return match
    return char
  })

  out = out.replace(LOWER_CONSONANT_FRAG_RE, (match, char: string, offset: number) => {
    const before = out.slice(Math.max(0, offset - 2), offset)
    if (/\b[aáeéoóôúi]\s$/i.test(before + char + " ")) {
      return match
    }
    if (PT_SINGLE_WORD.has(char.toLowerCase())) {
      return match
    }
    const prev = out[offset - 1]
    if (char.toLowerCase() === "s" && prev?.toLowerCase() === "a") {
      return match
    }
    return char
  })

  return out.replace(/\bVas\b/g, "V as")
}

export type RepairPdfTextResult = {
  text: string
  wasRepaired: boolean
}

/** Corrige espaços inseridos pelo pdf-parse no meio de palavras. */
export function repairPdfSpuriousSpaces(text: string): string {
  if (!text) return text
  if (!text.includes(" ")) return text

  const lines = text.split("\n")
  const repaired = lines.map((line) => {
    const collapsed = line.replace(/[ \t\f\v]+/g, " ").trim()
    return repairLine(collapsed)
  })
  return repaired.join("\n")
}

export function repairPdfSpuriousSpacesWithMeta(text: string): RepairPdfTextResult {
  const repaired = repairPdfSpuriousSpaces(text)
  return { text: repaired, wasRepaired: repaired !== text }
}

/** Detecta padrões residuais típicos de PDF quebrado. */
export function hasResidualPdfSpacingArtifacts(text: string): boolean {
  return (
    /(?<![A-Ea-e]\))[A-ZÁÉÍÓÚÃÕÇ]\s+[a-záéíóúãõç]{2,}/.test(text) ||
    /\b[b-df-hj-np-tv-zç]\s+[a-záéíóúãõç]{2,}/i.test(text)
  )
}
