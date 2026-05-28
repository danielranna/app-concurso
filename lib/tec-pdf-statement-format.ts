import type { QuestionType } from "./question-types"
import { repairPdfSpuriousSpaces } from "./pdf-text-repair"

const ROMAN_NUMERAL = "I{1,3}|II|III|IV|V|VI{0,3}|VII|VIII|IX|X"

const ROMAN_ORDER = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] as const

type RomanHit = { index: number; length: number; roman: (typeof ROMAN_ORDER)[number] }

const ROMAN_CANDIDATE_RE = new RegExp(`\\b(${ROMAN_NUMERAL})\\b`, "gi")

const ARTICLE_AFTER_ROMAN = /^\s+(?:a|o|as|os|um|uma|e)\b/i

const CLOSING_PHRASE_RE =
  /\s+((?:Quantas(?:\s+(?:das|as))?\s+afirmativas|Estão certos apenas os itens|Assinale)\b[^.]*?)(\s*$)/i

function normalizeRomanToken(raw: string): RomanHit["roman"] | null {
  const u = raw.toUpperCase()
  return (ROMAN_ORDER.find((r) => r === u) as RomanHit["roman"] | undefined) ?? null
}

/** Marcador válido de item de lista (não confunde V com Vier). */
function hasValidListMarker(rest: string, roman: string): boolean {
  if (/^\s*[-–.]\s*/.test(rest)) return true
  if (ARTICLE_AFTER_ROMAN.test(rest)) return true
  if (/^\s+[A-ZÁÉÍÓÚÃÕÇ]/.test(rest)) return true

  const cont = rest.match(/^\s+([a-záéíóúãõç]{2,})/i)
  if (cont) {
    const w = cont[1].toLowerCase()
    if (["as", "os", "um", "uma", "a", "o", "e"].includes(w)) return true
    return false
  }

  if (roman === "V") {
    return /^\s+(?:as|os|um|uma)\b/i.test(rest)
  }

  return false
}

function scanRomanCandidates(text: string): RomanHit[] {
  const hits: RomanHit[] = []
  const re = new RegExp(ROMAN_CANDIDATE_RE.source, "gi")
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const roman = normalizeRomanToken(m[1])
    if (!roman) continue
    const rest = text.slice(m.index + m[0].length)
    if (!hasValidListMarker(rest, roman)) continue
    hits.push({ index: m.index, length: m[0].length, roman })
  }
  return hits
}

/** Sequência I→II→III no enunciado (alternativas A–E podem citar romanos fora de ordem). */
export function findRomanListSequence(text: string): RomanHit[] | null {
  const hits = scanRomanCandidates(text)
  let best: RomanHit[] = []

  for (let start = 0; start < hits.length; start++) {
    if (hits[start].roman !== "I") continue
    const seq: RomanHit[] = [hits[start]]
    let expected = 1
    for (let j = start + 1; j < hits.length && expected < ROMAN_ORDER.length; j++) {
      if (hits[j].roman === ROMAN_ORDER[expected]) {
        seq.push(hits[j])
        expected++
      }
    }
    if (seq.length >= 3 && seq.length > best.length) best = seq
  }

  return best.length >= 3 ? best : null
}

export function looksLikeRomanNumeralList(text: string): boolean {
  return findRomanListSequence(text) !== null
}

function fixRomanVasArtifact(text: string): string {
  return text.replace(/\bVas\s+(normas|leis|fontes|dispositivos)/gi, "V as $1")
}

function fixAcronymSpacing(text: string): string {
  return text.replace(/\b([A-Z]{2,})(serão|será|são|foi|foram)\b/g, "$1 $2")
}

function applyFirstItemIntroBreaks(text: string, firstHit: RomanHit): string {
  const before = text.slice(0, firstHit.index)
  const after = text.slice(firstHit.index)

  if (/(?:afirmativas?\s+)?a\s+seguir|seguir|abaixo\s*$/i.test(before.trimEnd())) {
    return before.replace(/\s*:\s*$/, ":\n\n") + after
  }
  if (/:\s*$/.test(before)) {
    return before.replace(/\s*$/, "\n\n") + after
  }
  return text
}

function normalizeRomanItemPrefix(sliceFromRoman: string, hit: RomanHit): string {
  const re = new RegExp(`^${hit.roman}\\s*[-–.]?\\s*`, "i")
  const body = sliceFromRoman.replace(re, "")
  return `${hit.roman}- ${body}`
}

function formatRomanSequenceBreaks(text: string, seq: RomanHit[]): string {
  let out = applyFirstItemIntroBreaks(text, seq[0])

  for (let i = seq.length - 1; i >= 0; i--) {
    const hit = seq[i]
    const at = out.indexOf(hit.roman, i === 0 ? 0 : hit.index)
    const pos = at >= 0 ? at : hit.index
    const prefix = out.slice(0, pos).replace(/\s+$/, "")
    const suffix = normalizeRomanItemPrefix(out.slice(pos), hit)
    const br = i === 0 ? "\n\n" : "\n"
    const needsBreak = i > 0 || !/\n\s*$/.test(prefix)
    out = needsBreak ? `${prefix}${br}${suffix}` : `${prefix}${suffix}`
  }

  return out
}

function formatRomanClosingBreaks(text: string): string {
  return text.replace(CLOSING_PHRASE_RE, "\n\n$1$2")
}

export function formatRomanNumeralListBreaks(statement: string): string {
  let out = fixRomanVasArtifact(statement)

  const seq = findRomanListSequence(out)
  if (!seq) {
    out = out.replace(
      new RegExp(
        `\\b(incluem|compreendem|são|apenas|contemplam|abrangem|referem-se)\\s+(${ROMAN_NUMERAL})\\s*[-–.]?\\s*`,
        "gi"
      ),
      "$1\n$2- "
    )
    return fixAcronymSpacing(formatRomanClosingBreaks(out))
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }

  out = formatRomanSequenceBreaks(out, seq)
  out = formatRomanClosingBreaks(out)

  return fixAcronymSpacing(out).replace(/\n{3,}/g, "\n\n").trim()
}

function optionsLookLikeVfSequence(options: { text: string }[]): boolean {
  if (options.length < 2) return false
  return options.every((o) => /^[VF](\s*[-–]\s*[VF])+/i.test(o.text.trim()))
}

export function formatVfAffirmationBreaks(
  statement: string,
  options: { text: string }[]
): string {
  const placeholderCount = (statement.match(/\(\s*\)/g) ?? []).length
  if (placeholderCount < 2 && !optionsLookLikeVfSequence(options)) {
    return statement
  }

  let out = statement

  out = out.replace(/\s*\(\s*\)\s*/g, "\n( ) ")

  out = out.replace(
    /\s+(As afirmativas são,?\s*respectivamente,?)/i,
    "\n\n$1"
  )

  return out.replace(/\n{3,}/g, "\n\n").trim()
}

export function formatJulgueStatementBreaks(statement: string): string {
  if (!/\bjulgue\b/i.test(statement)) return statement
  return statement.replace(
    /\b(julgue\b[^.]*\.)\s*(?=[A-Za-zÀ-ÿ])/gi,
    (_, intro: string) => `${intro}\n\n`
  )
}

export type StatementFormatMeta = {
  roman_list_formatted: boolean
  vf_sequence_formatted: boolean
}

export function formatStatementStructure(
  statement: string,
  opts: {
    type: QuestionType
    options: { label: string; text: string }[]
  }
): string {
  let s = repairPdfSpuriousSpaces(statement)
  s = formatRomanNumeralListBreaks(s)
  s =
    opts.type === "multiple_choice"
      ? formatVfAffirmationBreaks(s, opts.options)
      : s
  s = formatJulgueStatementBreaks(s)
  s = repairPdfSpuriousSpaces(s)
  s = fixAcronymSpacing(s)
  return s
}

export function getStatementFormatMeta(
  original: string,
  formatted: string,
  options: { text: string }[]
): StatementFormatMeta {
  return {
    roman_list_formatted:
      looksLikeRomanNumeralList(original) && /\n\s*I-\s/i.test(formatted),
    vf_sequence_formatted:
      ((original.match(/\(\s*\)/g) ?? []).length >= 2 ||
        optionsLookLikeVfSequence(options)) &&
      formatted.includes("\n( )"),
  }
}

export function assessStatementFormatQuality(
  statement: string
): { code: string; severity: "warn"; message: string }[] {
  const flags: { code: string; severity: "warn"; message: string }[] = []

  if (/\bVas\s+(normas|leis|fontes)/i.test(statement)) {
    flags.push({
      code: "roman_list_incomplete",
      severity: "warn",
      message:
        "Lista romana possivelmente incompleta (item V colado — confira enunciado)",
    })
  }

  if (/\nV-\s+[a-z]{2,}/i.test(statement) && !/\nV-\s+(?:as|os|um|uma)\b/i.test(statement)) {
    flags.push({
      code: "roman_list_incomplete",
      severity: "warn",
      message:
        'Possível falso item romano (ex.: "V" de "Vier") — confira enunciado',
    })
  }

  const lineBreakItems = (statement.match(/\n\s*(I{1,3}|II|III|IV|V)\s*-/gi) ?? []).length
  if (looksLikeRomanNumeralList(statement) && lineBreakItems < 3) {
    flags.push({
      code: "roman_list_incomplete",
      severity: "warn",
      message: "Lista romana detectada com poucas quebras de linha — confira enunciado",
    })
  }

  return flags
}
