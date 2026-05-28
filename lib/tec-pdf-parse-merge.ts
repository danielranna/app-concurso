import type { ParsedTecQuestion } from "./question-types"
import type { TecParserOptions } from "./tec-pdf-parser"
import {
  TEC_PARSER_LINES,
  TEC_PARSER_PRIMARY,
  TEC_PARSER_STRICT,
  parseQuestionBlock,
} from "./tec-pdf-parser"

export type ParseSource = "primary" | "lines" | "strict"

export type ParseConflict = {
  field: string
  values: Partial<Record<ParseSource, string>>
}

export type QuestionParseResult = {
  index: number
  tec_id: number
  raw_block: string
  merged: ParsedTecQuestion
  candidates: Record<ParseSource, ParsedTecQuestion | null>
  confidence: "high" | "medium" | "low"
  conflicts: ParseConflict[]
  warnings: string[]
}

const PARSER_OPTS: Record<ParseSource, TecParserOptions> = {
  primary: TEC_PARSER_PRIMARY,
  lines: TEC_PARSER_LINES,
  strict: TEC_PARSER_STRICT,
}

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase()
}

function fieldsMatch(a: ParsedTecQuestion, b: ParsedTecQuestion): boolean {
  return (
    a.type === b.type &&
    norm(a.correct_answer) === norm(b.correct_answer) &&
    norm(a.statement) === norm(b.statement) &&
    a.options.length === b.options.length
  )
}

function collectConflicts(
  candidates: Record<ParseSource, ParsedTecQuestion | null>
): ParseConflict[] {
  const sources = (["primary", "lines", "strict"] as ParseSource[]).filter(
    (s) => candidates[s] != null
  )
  if (sources.length < 2) return []

  const conflicts: ParseConflict[] = []
  const fields: { key: keyof ParsedTecQuestion; label: string; fmt?: (q: ParsedTecQuestion) => string }[] = [
    { key: "statement", label: "statement" },
    { key: "correct_answer", label: "correct_answer" },
    { key: "type", label: "type" },
    {
      key: "options",
      label: "options_count",
      fmt: (q) => String(q.options.length),
    },
    { key: "tec_subject", label: "tec_subject" },
    { key: "tec_topic", label: "tec_topic" },
  ]

  for (const { label, fmt, key } of fields) {
    const values: Partial<Record<ParseSource, string>> = {}
    for (const src of sources) {
      const q = candidates[src]!
      values[src] = fmt ? fmt(q) : String(q[key] ?? "")
    }
    const normalized = sources.map((s) => norm(values[s] ?? ""))
    if (new Set(normalized).size > 1) {
      conflicts.push({ field: label, values })
    }
  }
  return conflicts
}

function computeConfidence(
  candidates: Record<ParseSource, ParsedTecQuestion | null>
): "high" | "medium" | "low" {
  const list = (["primary", "lines", "strict"] as ParseSource[])
    .map((s) => candidates[s])
    .filter((q): q is ParsedTecQuestion => q != null)

  if (list.length === 0) return "low"
  if (list.length === 1) return "medium"

  let agreePairs = 0
  let totalPairs = 0
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      totalPairs++
      if (fieldsMatch(list[i], list[j])) agreePairs++
    }
  }

  if (list.length === 3 && agreePairs === 3) return "high"
  if (agreePairs >= 1) return "medium"
  return "low"
}

function pickMerged(
  candidates: Record<ParseSource, ParsedTecQuestion | null>,
  block: string,
  index: number
): ParsedTecQuestion {
  if (candidates.primary) return { ...candidates.primary }
  for (const src of ["lines", "strict"] as ParseSource[]) {
    if (candidates[src]) return { ...candidates[src]! }
  }
  const urlMatch = block.match(
    /(?:https?:\/\/)?(?:www\.)?tecconcursos\.com\.br\/questoes\/(\d+)/i
  )
  const tec_id = urlMatch ? parseInt(urlMatch[1], 10) : 0
  return {
    index,
    tec_id,
    tec_url: tec_id
      ? `https://www.tecconcursos.com.br/questoes/${tec_id}`
      : "",
    type: "multiple_choice",
    banca: "",
    cargo: "",
    orgao: "",
    ano: null,
    tec_subject: "",
    tec_topic: "",
    statement: "",
    options: [],
    correct_answer: "",
  }
}

export function parseBlockWithAllVariants(
  block: string,
  index: number,
  answers: Map<number, string>
): QuestionParseResult {
  const warnings: string[] = []
  const candidates: Record<ParseSource, ParsedTecQuestion | null> = {
    primary: null,
    lines: null,
    strict: null,
  }

  for (const src of ["primary", "lines", "strict"] as ParseSource[]) {
    try {
      const q = parseQuestionBlock(block, index, PARSER_OPTS[src])
      const ans = answers.get(q.index)
      if (ans) q.correct_answer = ans
      else warnings.push(`Questão ${q.index} (${q.tec_id}): gabarito não encontrado`)
      candidates[src] = q
    } catch (e) {
      warnings.push(
        `${src}: ${e instanceof Error ? e.message : "erro ao parsear"}`
      )
    }
  }

  const merged = pickMerged(candidates, block, index)
  const conflicts = collectConflicts(candidates)
  const confidence = computeConfidence(candidates)

  return {
    index,
    tec_id: merged.tec_id,
    raw_block: block,
    merged,
    candidates,
    confidence,
    conflicts,
    warnings,
  }
}

export function mergeQuestionEdits(
  base: QuestionParseResult,
  edited: ParsedTecQuestion
): QuestionParseResult {
  return {
    ...base,
    merged: { ...edited, index: base.index, tec_id: base.tec_id },
  }
}
