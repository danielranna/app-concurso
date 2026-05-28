import type { ParsedTecQuestion } from "./question-types"
import {
  hasResidualPdfSpacingArtifacts,
  repairPdfSpuriousSpacesWithMeta,
} from "./pdf-text-repair"
import { assessStatementFormatQuality } from "./tec-pdf-statement-format"

type ParseCandidates = Partial<
  Record<"primary" | "lines" | "strict", ParsedTecQuestion | null>
>

export type QualityFlag = {
  code: string
  severity: "warn" | "error"
  message: string
}

const ENUNCIADO_STARTERS =
  /\b(considerando|assinale|julgue|no que se refere|com base|analise|qual a|qual o)\b/i

const CRITICAL_WARN_CODES = new Set([
  "topic_leak_statement",
  "primary_lines_diverge",
  "subject_topic_duplicate",
  "answer_not_in_options",
  "options_count_mcq",
])

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase()
}

export function assessQuestionQuality(
  merged: ParsedTecQuestion,
  candidates?: ParseCandidates
): { quality_flags: QualityFlag[]; needs_review: boolean } {
  const flags: QualityFlag[] = []

  if (!merged.correct_answer?.trim()) {
    flags.push({
      code: "missing_answer",
      severity: "error",
      message: "Gabarito não encontrado",
    })
  }

  if (merged.type === "multiple_choice") {
    if (merged.options.length < 4 || merged.options.length > 5) {
      flags.push({
        code: "options_count_mcq",
        severity: "warn",
        message: `MCQ com ${merged.options.length} alternativa(s) (esperado 4 ou 5)`,
      })
    }
    const ans = merged.correct_answer.trim().toUpperCase()
    if (/^[A-E]$/.test(ans)) {
      const hasLabel = merged.options.some((o) => o.label.toUpperCase() === ans)
      if (!hasLabel) {
        flags.push({
          code: "answer_not_in_options",
          severity: "warn",
          message: `Gabarito "${ans}" não corresponde a nenhuma alternativa`,
        })
      }
    }
  }

  if (merged.type === "certo_errado" && merged.options.length > 2) {
    flags.push({
      code: "certo_errado_has_extra_options",
      severity: "warn",
      message: `Certo/Errado com ${merged.options.length} opções parseadas`,
    })
  }

  const stmt = merged.statement.trim()
  if (stmt.length < 25) {
    flags.push({
      code: "statement_too_short",
      severity: "warn",
      message: "Enunciado muito curto ou possivelmente incompleto",
    })
  }

  if (merged.tec_topic && ENUNCIADO_STARTERS.test(merged.tec_topic)) {
    flags.push({
      code: "topic_leak_statement",
      severity: "warn",
      message: "Assunto TEC parece conter texto do enunciado",
    })
  }

  if (merged.tec_topic && stmt) {
    const topicStart = norm(merged.tec_topic).slice(0, 40)
    if (topicStart.length > 15 && norm(stmt).startsWith(topicStart)) {
      flags.push({
        code: "subject_topic_duplicate",
        severity: "warn",
        message: "Início do enunciado repete o assunto TEC",
      })
    }
  }

  if (merged.options.some((o) => /\d+\)\s*\d+\)/.test(o.text))) {
    flags.push({
      code: "gabarito_in_option",
      severity: "warn",
      message: "Numeração de gabarito vazou em alternativa",
    })
  }

  const textBlob = [merged.statement, ...merged.options.map((o) => o.text)]
    .filter(Boolean)
    .join("\n")
  const { wasRepaired } = repairPdfSpuriousSpacesWithMeta(textBlob)
  if (wasRepaired || hasResidualPdfSpacingArtifacts(textBlob)) {
    flags.push({
      code: "pdf_spacing_repaired",
      severity: "warn",
      message: wasRepaired
        ? "Texto ajustado (espaços espúrios do PDF)"
        : "Possível espaço espúrio residual no texto — confira alternativas",
    })
  }

  if (/\n\s*I{1,3}\s*-/i.test(stmt) || /\n\s*II\s*-/i.test(stmt)) {
    flags.push({
      code: "roman_list_formatted",
      severity: "warn",
      message: "Lista romana formatada com quebras de linha",
    })
  }
  if (/\n\s*\(\s*\)\s+/i.test(stmt)) {
    flags.push({
      code: "vf_sequence_formatted",
      severity: "warn",
      message: "Sequência V/F formatada com quebras de linha",
    })
  }
  flags.push(...assessStatementFormatQuality(stmt))

  const primary = candidates?.primary
  const lines = candidates?.lines
  if (primary && lines && norm(primary.statement) !== norm(lines.statement)) {
    flags.push({
      code: "primary_lines_diverge",
      severity: "warn",
      message: "Parsers primary e lines divergem no enunciado",
    })
  }

  const needs_review =
    flags.some((f) => f.severity === "error") ||
    flags.some((f) => f.severity === "warn" && CRITICAL_WARN_CODES.has(f.code))

  return { quality_flags: flags, needs_review }
}

/** Rebaixa confiança se há flags de qualidade. */
export function applyQualityToConfidence(
  confidence: "high" | "medium" | "low",
  quality_flags: QualityFlag[]
): "high" | "medium" | "low" {
  if (confidence !== "high") return confidence
  const hasIssue =
    quality_flags.some((f) => f.severity === "error") ||
    quality_flags.some((f) => f.severity === "warn" && CRITICAL_WARN_CODES.has(f.code))
  return hasIssue ? "medium" : confidence
}
