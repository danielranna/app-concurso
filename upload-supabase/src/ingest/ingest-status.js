import {
  AUTO_PICK_ORDER,
  deriveEffectiveStep,
  docHasSourceText,
  emptyStepSummary,
  ragStatusFromCounts,
} from "./effective-step.js"

const ID_PAGE = 200

function subjectNameFromRow(row) {
  const s = row.subjects
  if (!s) return null
  if (Array.isArray(s)) return s[0]?.name ?? null
  return s.name ?? null
}

async function fetchAllStudyMaterialDocs(supabase, userId) {
  const { data, error } = await supabase
    .from("subject_documents")
    .select(
      "id, title, ingest_stage, ingest_error, page_count, subject_id, created_at, parsed_tables, subjects(name)"
    )
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

async function fetchChunkCountsByDocument(supabase, documentIds) {
  const perDoc = new Map()
  for (const id of documentIds) perDoc.set(id, { total: 0, embedded: 0 })
  if (!documentIds.length) return perDoc

  for (let i = 0; i < documentIds.length; i += ID_PAGE) {
    const idBatch = documentIds.slice(i, i + ID_PAGE)
    let from = 0
    const pageSize = 2000
    while (true) {
      const { data: rows, error } = await supabase
        .from("document_chunks")
        .select("document_id, embedding")
        .in("document_id", idBatch)
        .range(from, from + pageSize - 1)

      if (error) throw new Error(error.message)
      if (!rows?.length) break

      for (const row of rows) {
        const s = perDoc.get(row.document_id)
        if (!s) continue
        s.total++
        if (row.embedding != null) s.embedded++
      }

      if (rows.length < pageSize) break
      from += pageSize
    }
  }

  return perDoc
}

async function fetchSourceTextDocIds(supabase, documentIds) {
  const found = new Set()
  if (!documentIds.length) return found

  for (let i = 0; i < documentIds.length; i += ID_PAGE) {
    const batch = documentIds.slice(i, i + ID_PAGE)
    const { data, error } = await supabase
      .from("document_source_text")
      .select("document_id")
      .in("document_id", batch)

    if (error) throw new Error(error.message)
    for (const row of data ?? []) found.add(row.document_id)
  }

  return found
}

export async function buildIngestStatusItems(supabase, userId) {
  const docs = await fetchAllStudyMaterialDocs(supabase, userId)
  const ids = docs.map((d) => d.id)
  const [chunkMap, sourceTextIds] = await Promise.all([
    fetchChunkCountsByDocument(supabase, ids),
    fetchSourceTextDocIds(supabase, ids),
  ])

  return docs.map((doc) => {
    const counts = chunkMap.get(doc.id) ?? { total: 0, embedded: 0 }
    const ragStatus = ragStatusFromCounts(counts.total, counts.embedded)
    const has_source_text = docHasSourceText(doc, sourceTextIds)
    const effective_step = deriveEffectiveStep(
      doc,
      ragStatus,
      has_source_text
    )

    return {
      id: doc.id,
      title: doc.title,
      subject_id: doc.subject_id,
      subject_name: subjectNameFromRow(doc),
      ingest_stage: doc.ingest_stage ?? "uploaded",
      effective_step,
      has_source_text,
      chunks_db: counts.total,
      embedded_db: counts.embedded,
      ingest_error: doc.ingest_error,
      page_count: doc.page_count,
      created_at: doc.created_at,
    }
  })
}

export function pickNextStatusItem(items, options = {}) {
  const actionable = items.filter(
    (i) =>
      i.effective_step !== "processing" && i.effective_step !== "rag_done"
  )

  if (options.stepFilter) {
    const filtered = actionable.filter(
      (i) => i.effective_step === options.stepFilter
    )
    if (!filtered.length) return null
    if (options.random) {
      return filtered[Math.floor(Math.random() * filtered.length)]
    }
    return filtered[0]
  }

  for (const step of AUTO_PICK_ORDER) {
    const candidates = actionable.filter((i) => i.effective_step === step)
    if (!candidates.length) continue
    if (options.random) {
      return candidates[Math.floor(Math.random() * candidates.length)]
    }
    return candidates[0]
  }

  return null
}

export async function readIngestStatusSummary(supabase, userId) {
  const items = await buildIngestStatusItems(supabase, userId)
  const summary = emptyStepSummary()
  for (const item of items) summary[item.effective_step]++
  return { summary, total: items.length, items }
}

export { emptyStepSummary }
