import {
  ragStatusFromCounts,
  type RagDocStatus,
} from "./document-ingest"

export type EffectiveIngestStep =
  | "queued"
  | "processing"
  | "needs_parse"
  | "needs_chunk"
  | "needs_embed"
  | "rag_partial"
  | "rag_done"
  | "failed"

export const EFFECTIVE_STEPS: EffectiveIngestStep[] = [
  "queued",
  "processing",
  "needs_parse",
  "needs_chunk",
  "needs_embed",
  "rag_partial",
  "rag_done",
  "failed",
]

export const EFFECTIVE_STEP_LABELS: Record<EffectiveIngestStep, string> = {
  queued: "Na fila",
  processing: "Processando",
  needs_parse: "Sem texto",
  needs_chunk: "Com texto, sem trechos",
  needs_embed: "Trechos sem vetor",
  rag_partial: "RAG parcial",
  rag_done: "RAG completo",
  failed: "Erro",
}

/** Prioridade do worker `auto` (menor índice = primeiro). */
export const AUTO_PICK_ORDER: EffectiveIngestStep[] = [
  "queued",
  "needs_chunk",
  "needs_parse",
  "needs_embed",
  "rag_partial",
  "failed",
]

export type IngestDocInput = {
  id: string
  title: string
  ingest_stage: string | null
  ingest_error?: string | null
  page_count?: number | null
  subject_id: string | null
  created_at: string
  parsed_tables?: Record<string, unknown> | null
  subjects?: { name: string } | { name: string }[] | null
}

export type ChunkCounts = { total: number; embedded: number }

export function docHasSourceText(
  doc: IngestDocInput,
  sourceTextIds: Set<string>
): boolean {
  if (sourceTextIds.has(doc.id)) return true
  const pt = (doc.parsed_tables ?? {}) as {
    full_text?: string
    text_excerpt?: string
    text_in_table?: boolean
  }
  const full = String(pt.full_text ?? "").trim()
  const excerpt = String(pt.text_excerpt ?? "").trim()
  return full.length > 0 || excerpt.length > 50
}

export function deriveEffectiveStep(
  doc: IngestDocInput,
  ragStatus: RagDocStatus,
  hasSourceText: boolean
): EffectiveIngestStep {
  const stage = doc.ingest_stage ?? "uploaded"

  if (stage === "failed") {
    if (ragStatus === "complete") return "rag_done"
    if (ragStatus === "partial") return "rag_partial"
    if (ragStatus === "lexical_only") return "needs_embed"
    if (ragStatus === "no_chunks") {
      return hasSourceText ? "needs_chunk" : "needs_parse"
    }
    return "failed"
  }

  if (stage === "uploaded") return "queued"

  if (
    stage === "parsing" ||
    stage === "chunking" ||
    stage === "embedding"
  ) {
    return "processing"
  }

  if (ragStatus === "complete") return "rag_done"
  if (ragStatus === "partial") return "rag_partial"
  if (ragStatus === "lexical_only") return "needs_embed"

  if (ragStatus === "no_chunks") {
    return hasSourceText ? "needs_chunk" : "needs_parse"
  }

  return "needs_parse"
}

export function emptyStepSummary(): Record<EffectiveIngestStep, number> {
  return {
    queued: 0,
    processing: 0,
    needs_parse: 0,
    needs_chunk: 0,
    needs_embed: 0,
    rag_partial: 0,
    rag_done: 0,
    failed: 0,
  }
}

export function summarizeSteps(
  steps: EffectiveIngestStep[]
): Record<EffectiveIngestStep, number> {
  const summary = emptyStepSummary()
  for (const s of steps) summary[s]++
  return summary
}

export function ragStatusFromChunkCounts(counts: ChunkCounts): RagDocStatus {
  return ragStatusFromCounts(counts.total, counts.embedded)
}

export function workRemainingFromSummary(
  summary: Record<EffectiveIngestStep, number>
): number {
  return (
    summary.queued +
    summary.processing +
    summary.needs_parse +
    summary.needs_chunk +
    summary.needs_embed +
    summary.rag_partial +
    summary.failed
  )
}

export function subjectNameFromIngestDoc(doc: IngestDocInput): string | null {
  const s = doc.subjects
  if (!s) return null
  if (Array.isArray(s)) return s[0]?.name ?? null
  return s.name ?? null
}
