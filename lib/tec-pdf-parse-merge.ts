import type { ParsedTecQuestion } from "./question-types"
import type { TecParserOptions } from "./tec-pdf-parser"
import {
  TEC_PARSER_LINES,
  TEC_PARSER_PRIMARY,
  TEC_PARSER_STRICT,
  normalizeMcqOptionLineBreaks,
  parseQuestionBlock,
} from "./tec-pdf-parser"
import {
  applyQualityToConfidence,
  assessQuestionQuality,
  type QualityFlag,
} from "./tec-pdf-parse-quality"

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
  parser_notes: string[]
  quality_flags: QualityFlag[]
  needs_review: boolean
}

const PARSER_OPTS: Record<ParseSource, TecParserOptions> = {
  primary: TEC_PARSER_PRIMARY,
  lines: TEC_PARSER_LINES,
  strict: TEC_PARSER_STRICT,
}

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase()
}

function criticalFieldsMatch(a: ParsedTecQuestion, b: ParsedTecQuestion): boolean {
  return (
    a.type === b.type &&
    norm(a.correct_answer) === norm(b.correct_answer) &&
    norm(a.statement) === norm(b.statement) &&
    a.options.length === b.options.length
  )
}

function hasStrongDisagreement(
  candidates: Record<ParseSource, ParsedTecQuestion | null>
): boolean {
  const list = (["primary", "lines", "strict"] as ParseSource[])
    .map((s) => candidates[s])
    .filter((q): q is ParsedTecQuestion => q != null)

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (list[i].type !== list[j].type) return true
      if (norm(list[i].correct_answer) !== norm(list[j].correct_answer)) return true
    }
  }
  return false
}

function collectConflicts(
  candidates: Record<ParseSource, ParsedTecQuestion | null>
): ParseConflict[] {
  const sources = (["primary", "lines", "strict"] as ParseSource[]).filter(
    (s) => candidates[s] != null
  )
  if (sources.length < 2) return []

  const conflicts: ParseConflict[] = []
  const fields: {
    key: keyof ParsedTecQuestion
    label: string
    fmt?: (q: ParsedTecQuestion) => string
  }[] = [
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

/** Só parsers que parsearam com sucesso; falha do strict não penaliza. */
function computeConfidence(
  candidates: Record<ParseSource, ParsedTecQuestion | null>
): "high" | "medium" | "low" {
  const primary = candidates.primary
  const lines = candidates.lines

  if (!primary && !lines && !candidates.strict) return "low"

  if (primary && lines && criticalFieldsMatch(primary, lines)) {
    return "high"
  }

  const successful = (["primary", "lines", "strict"] as ParseSource[]).filter(
    (s) => candidates[s] != null
  )

  if (successful.length === 1) return "medium"

  if (hasStrongDisagreement(candidates)) return "low"

  return "medium"
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
  const parser_notes: string[] = []
  const candidates: Record<ParseSource, ParsedTecQuestion | null> = {
    primary: null,
    lines: null,
    strict: null,
  }

  const normalizedBlock = normalizeMcqOptionLineBreaks(block)

  for (const src of ["primary", "lines", "strict"] as ParseSource[]) {
    try {
      const q = parseQuestionBlock(normalizedBlock, index, PARSER_OPTS[src])
      const ans = answers.get(q.index)
      if (ans) q.correct_answer = ans
      else warnings.push(`Questão ${q.index} (${q.tec_id}): gabarito não encontrado`)
      candidates[src] = q
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro ao parsear"
      if (src === "strict") {
        parser_notes.push(`Parser strict não aplicável neste layout (${msg})`)
      } else {
        warnings.push(`${src}: ${msg}`)
      }
    }
  }

  const merged = pickMerged(candidates, block, index)
  const conflicts = collectConflicts(candidates)
  let confidence = computeConfidence(candidates)
  const { quality_flags, needs_review } = assessQuestionQuality(merged, candidates)
  confidence = applyQualityToConfidence(confidence, quality_flags)

  return {
    index,
    tec_id: merged.tec_id,
    raw_block: block,
    merged,
    candidates,
    confidence,
    conflicts,
    warnings,
    parser_notes,
    quality_flags,
    needs_review,
  }
}

export function mergeQuestionEdits(
  base: QuestionParseResult,
  edited: ParsedTecQuestion
): QuestionParseResult {
  const merged = { ...edited, index: base.index, tec_id: base.tec_id }
  const { quality_flags, needs_review } = assessQuestionQuality(
    merged,
    base.candidates
  )
  let confidence = applyQualityToConfidence(base.confidence, quality_flags)
  if (!merged.correct_answer?.trim()) {
    confidence = "low"
  }
  return {
    ...base,
    merged,
    quality_flags,
    needs_review,
    confidence,
  }
}
