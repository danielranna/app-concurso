import { extractPdfText } from "./pdf-extract"
import type { BankQuestionSnapshot, ParsedTecNotebook } from "./question-types"
import { extractTecPdfStructure } from "./tec-pdf-parser"
import { parseBlockWithAllVariants, type QuestionParseResult } from "./tec-pdf-parse-merge"

export type ImportQuestionParseResult = QuestionParseResult & {
  existing_in_bank: BankQuestionSnapshot | null
  /** Padrão false: mantém a versão do banco. True = sobrescrever com o PDF revisado. */
  replace_in_bank: boolean
}

export type NotebookParseResult = {
  name: string
  share_url: string | null
  ordering: string | null
  questions: QuestionParseResult[]
  warnings: string[]
  stats: {
    total: number
    high: number
    medium: number
    low: number
    needs_review: number
  }
}

export type ImportNotebookParseResult = Omit<NotebookParseResult, "questions" | "stats"> & {
  questions: ImportQuestionParseResult[]
  stats: NotebookParseResult["stats"] & { already_in_bank: number }
}

export function parseTecPdfTextPipeline(rawText: string): NotebookParseResult {
  const warnings: string[] = []
  const { name, share_url, ordering, answers, blocks } = extractTecPdfStructure(rawText)

  const questions: QuestionParseResult[] = []
  blocks.forEach((block, i) => {
    const result = parseBlockWithAllVariants(block, i + 1, answers)
    questions.push(result)
    warnings.push(...result.warnings)
  })

  if (questions.length !== answers.size && answers.size > 0) {
    warnings.push(
      `Contagem: ${questions.length} questões no corpo vs ${answers.size} gabaritos`
    )
  }

  const stats = {
    total: questions.length,
    high: questions.filter((q) => q.confidence === "high").length,
    medium: questions.filter((q) => q.confidence === "medium").length,
    low: questions.filter((q) => q.confidence === "low").length,
    needs_review: questions.filter((q) => q.needs_review).length,
  }

  return { name, share_url, ordering, questions, warnings, stats }
}

export async function parseTecPdfPipeline(buffer: Buffer): Promise<NotebookParseResult> {
  const text = await extractPdfText(buffer)
  return parseTecPdfTextPipeline(text)
}

/** Converte resultado do wizard em notebook para import. */
export function notebookParseResultToParsed(
  result: NotebookParseResult
): ParsedTecNotebook {
  return {
    name: result.name,
    share_url: result.share_url,
    ordering: result.ordering,
    questions: result.questions.map((q) => q.merged),
    warnings: result.warnings,
  }
}
