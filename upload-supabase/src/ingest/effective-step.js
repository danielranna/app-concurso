export const AUTO_PICK_ORDER = [
  "queued",
  "needs_chunk",
  "needs_parse",
  "needs_embed",
  "rag_partial",
  "failed",
]

export function ragStatusFromCounts(total, embedded) {
  if (total === 0) return "no_chunks"
  if (embedded === total) return "complete"
  if (embedded === 0) return "lexical_only"
  return "partial"
}

export function docHasSourceText(doc, sourceTextIds) {
  if (sourceTextIds.has(doc.id)) return true
  const pt = doc.parsed_tables ?? {}
  const full = String(pt.full_text ?? "").trim()
  const excerpt = String(pt.text_excerpt ?? "").trim()
  return full.length > 0 || excerpt.length > 50
}

export function deriveEffectiveStep(doc, ragStatus, hasSourceText) {
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

export function emptyStepSummary() {
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
