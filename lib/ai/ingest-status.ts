import { supabaseServer } from "../supabase-server"
import {
  deriveEffectiveStep,
  docHasSourceText,
  emptyStepSummary,
  ragStatusFromChunkCounts,
  subjectNameFromIngestDoc,
  AUTO_PICK_ORDER,
  type EffectiveIngestStep,
  type IngestDocInput,
} from "./ingest-effective-step"
import type { RagDocStatus } from "./document-ingest"

export type IngestStatusItem = {
  id: string
  title: string
  subject_id: string | null
  subject_name: string | null
  ingest_stage: string
  effective_step: EffectiveIngestStep
  has_source_text: boolean
  chunks_db: number
  embedded_db: number
  ingest_error?: string | null
  page_count?: number | null
  created_at: string
}

export type IngestStatusResponse = {
  summary: Record<EffectiveIngestStep, number>
  total: number
  filtered_total: number
  items: IngestStatusItem[]
  current_item: IngestStatusItem | null
  recent_errors: IngestStatusItem[]
  offset: number
  limit: number
  has_more: boolean
  batch_running: boolean
}

const ID_PAGE = 200

async function fetchAllStudyMaterialDocs(
  userId: string
): Promise<IngestDocInput[]> {
  const { data, error } = await supabaseServer
    .from("subject_documents")
    .select(
      "id, title, ingest_stage, ingest_error, page_count, subject_id, created_at, parsed_tables, subjects(name)"
    )
    .eq("user_id", userId)
    .eq("doc_type", "study_material")
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as IngestDocInput[]
}

async function fetchChunkCountsByDocument(
  documentIds: string[]
): Promise<Map<string, { total: number; embedded: number }>> {
  const perDoc = new Map<string, { total: number; embedded: number }>()
  for (const id of documentIds) perDoc.set(id, { total: 0, embedded: 0 })
  if (!documentIds.length) return perDoc

  for (let i = 0; i < documentIds.length; i += ID_PAGE) {
    const idBatch = documentIds.slice(i, i + ID_PAGE)
    let from = 0
    const pageSize = 2000
    while (true) {
      const { data: rows, error } = await supabaseServer
        .from("document_chunks")
        .select("document_id, embedding")
        .in("document_id", idBatch)
        .range(from, from + pageSize - 1)

      if (error) throw new Error(error.message)
      if (!rows?.length) break

      for (const row of rows) {
        const docId = row.document_id as string
        const s = perDoc.get(docId)
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

async function fetchSourceTextDocIds(documentIds: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  if (!documentIds.length) return found

  for (let i = 0; i < documentIds.length; i += ID_PAGE) {
    const batch = documentIds.slice(i, i + ID_PAGE)
    const { data, error } = await supabaseServer
      .from("document_source_text")
      .select("document_id")
      .in("document_id", batch)

    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      found.add(row.document_id as string)
    }
  }

  return found
}

export async function buildIngestStatusItems(
  userId: string
): Promise<IngestStatusItem[]> {
  const docs = await fetchAllStudyMaterialDocs(userId)
  const ids = docs.map((d) => d.id)
  const [chunkMap, sourceTextIds] = await Promise.all([
    fetchChunkCountsByDocument(ids),
    fetchSourceTextDocIds(ids),
  ])

  return docs.map((doc) => {
    const counts = chunkMap.get(doc.id) ?? { total: 0, embedded: 0 }
    const ragStatus: RagDocStatus = ragStatusFromChunkCounts(counts)
    const has_source_text = docHasSourceText(doc, sourceTextIds)
    const effective_step = deriveEffectiveStep(doc, ragStatus, has_source_text)

    return {
      id: doc.id,
      title: doc.title,
      subject_id: doc.subject_id,
      subject_name: subjectNameFromIngestDoc(doc),
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

export async function readIngestStatus(
  userId: string,
  options?: {
    step?: EffectiveIngestStep
    limit?: number
    offset?: number
    q?: string
    batchRunning?: boolean
  }
): Promise<IngestStatusResponse> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100)
  const offset = Math.max(options?.offset ?? 0, 0)
  const q = options?.q?.trim().toLowerCase() ?? ""

  const allItems = await buildIngestStatusItems(userId)
  const summary = emptyStepSummary()
  for (const item of allItems) summary[item.effective_step]++

  let filtered = allItems
  if (options?.step) {
    filtered = filtered.filter((i) => i.effective_step === options.step)
  }
  if (q) {
    filtered = filtered.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.subject_name?.toLowerCase().includes(q) ?? false)
    )
  }

  const totalFiltered = filtered.length
  const page = filtered.slice(offset, offset + limit)
  const currentProcessing =
    allItems.find((i) => i.effective_step === "processing") ?? null
  const currentItem =
    currentProcessing ?? pickNextStatusItem(allItems) ?? null
  const recentErrors = allItems
    .filter((i) => i.effective_step === "failed" && i.ingest_error)
    .slice(0, 5)

  return {
    summary,
    total: allItems.length,
    filtered_total: totalFiltered,
    items: page,
    current_item: currentItem,
    recent_errors: recentErrors,
    offset,
    limit,
    has_more: offset + limit < totalFiltered,
    batch_running: options?.batchRunning ?? false,
  }
}

export function pickNextStatusItem(
  items: IngestStatusItem[],
  options?: {
    stepFilter?: EffectiveIngestStep
    random?: boolean
  }
): IngestStatusItem | null {
  const actionable = items.filter(
    (i) =>
      i.effective_step !== "processing" && i.effective_step !== "rag_done"
  )

  if (options?.stepFilter) {
    const filtered = actionable.filter(
      (i) => i.effective_step === options.stepFilter
    )
    if (!filtered.length) return null
    if (options.random) {
      return filtered[Math.floor(Math.random() * filtered.length)]!
    }
    return filtered[0]!
  }

  for (const step of AUTO_PICK_ORDER) {
    const candidates = actionable.filter((i) => i.effective_step === step)
    if (!candidates.length) continue
    if (options?.random) {
      return candidates[Math.floor(Math.random() * candidates.length)]!
    }
    return candidates[0]!
  }

  return null
}
