import type { QuestionType } from "./question-types"
import { repairPdfSpuriousSpaces } from "./pdf-text-repair"

const ROMAN_NUMERAL = "I{1,3}|II|III|IV|V|VI{0,3}|VII|VIII|IX|X"

const ROMAN_ITEM_RE = new RegExp(`\\b(${ROMAN_NUMERAL})\\b`, "gi")

function countRomanTokens(text: string): number {
  return (text.match(ROMAN_ITEM_RE) ?? []).length
}

export function looksLikeRomanNumeralList(text: string): boolean {
  return countRomanTokens(text) >= 3
}

/** Corrige "Vas normas" colado pelo reparo de espaços antes de formatar lista. */
function fixRomanVasArtifact(text: string): string {
  return text.replace(/\bVas\s+(normas|leis|fontes|dispositivos)/gi, "V as $1")
}

export function formatRomanNumeralListBreaks(statement: string): string {
  if (!looksLikeRomanNumeralList(statement)) return statement

  let out = fixRomanVasArtifact(statement)

  out = out.replace(
    new RegExp(
      `\\b(incluem|compreendem|são|apenas|contemplam|abrangem|referem-se)\\s+(${ROMAN_NUMERAL})\\s*[-–.]?\\s*`,
      "gi"
    ),
    "$1\n$2- "
  )

  out = out.replace(
    new RegExp(
      `\\.\\s+(${ROMAN_NUMERAL})\\s*[-–.]?\\s*(?=[a-záéíóúãõç])`,
      "gi"
    ),
    ".\n$1- "
  )

  out = out.replace(/\.\s+(V)\s+(?=(?:as|os|um|uma)\s)/gi, ".\n$1- ")

  out = out.replace(/\s+(Estão certos apenas os itens)/i, "\n\n$1")

  return out.replace(/\n{3,}/g, "\n\n").trim()
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

/** Após "julgue … .", quebra parágrafo antes do corpo do item (CEBRASPE). */
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
  return s
}

export function getStatementFormatMeta(
  original: string,
  formatted: string,
  options: { text: string }[]
): StatementFormatMeta {
  return {
    roman_list_formatted:
      looksLikeRomanNumeralList(original) && formatted.includes("\nI"),
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

  const lineBreakItems = (statement.match(/\n\s*(I{1,3}|IV|VI{0,3}|IX|X)\s*-/gi) ?? [])
    .length
  if (looksLikeRomanNumeralList(statement) && lineBreakItems < 3) {
    flags.push({
      code: "roman_list_incomplete",
      severity: "warn",
      message: "Lista romana detectada com poucas quebras de linha — confira enunciado",
    })
  }

  return flags
}
