import { createHash } from "crypto"
import { supabaseServer } from "../supabase-server"
import { COACH_DOCS_BUCKET, listCoachDocuments } from "../coach-documents"
import { extractPdfTextWithTimeout } from "../pdf-extract"
import { embedTexts } from "./embeddings"
import { getUserAiCredentials } from "./user-credentials"

const PAGE_TARGET_CHARS = 2800
const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 200
const MIN_CHUNK = 80
const EMBED_BATCH = 40

export type IngestStage =
  | "uploaded"
  | "parsing"
  | "chunking"
  | "embedding"
  | "ready"
  | "failed"

export function fileSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

export function splitIntoPages(text: string): string[] {
  const byFf = text
    .split(/\f+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_CHUNK)
  if (byFf.length > 1) return byFf

  const pages: string[] = []
  for (let i = 0; i < text.length; i += PAGE_TARGET_CHARS) {
    const slice = text.slice(i, i + PAGE_TARGET_CHARS).trim()
    if (slice.length >= MIN_CHUNK) pages.push(slice)
  }
  return pages.length ? pages : text.trim().length >= MIN_CHUNK ? [text.trim()] : []
}

export function chunkPageText(pageText: string): string[] {
  if (pageText.length <= CHUNK_SIZE + 100) {
    return pageText.length >= MIN_CHUNK ? [pageText] : []
  }
  const chunks: string[] = []
  let i = 0
  while (i < pageText.length) {
    const end = Math.min(i + CHUNK_SIZE, pageText.length)
    const part = pageText.slice(i, end).trim()
    if (part.length >= MIN_CHUNK) chunks.push(part)
    i += CHUNK_SIZE - CHUNK_OVERLAP
    if (end >= pageText.length) break
  }
  return chunks
}

export function buildChunksFromText(
  text: string,
  meta: { document_id: string; title: string; subject_id?: string | null; doc_type: string }
): { content: string; metadata: Record<string, unknown> }[] {
  const pages = splitIntoPages(text)
  const rows: { content: string; metadata: Record<string, unknown> }[] = []
  let globalIndex = 0

  for (let pageNum = 0; pageNum < pages.length; pageNum++) {
    const pageParts = chunkPageText(pages[pageNum]!)
    for (const content of pageParts) {
      rows.push({
        content,
        metadata: {
          chunk_index: globalIndex,
          page: pageNum + 1,
          page_start: pageNum + 1,
          page_end: pageNum + 1,
          title: meta.title,
          document_id: meta.document_id,
          subject_id: meta.subject_id ?? null,
          doc_type: meta.doc_type,
        },
      })
      globalIndex++
    }
  }
  return rows
}

export async function failDocumentIngest(documentId: string, message: string) {
  await updateDocumentIngest(documentId, {
    ingest_stage: "failed",
    status: "failed",
    ingest_error: message.slice(0, 500),
  })
}

export async function markProcessingStarted(
  userId: string,
  documentId: string
) {
  const doc = await getDocumentById(userId, documentId)
  const pt = (doc?.parsed_tables ?? {}) as Record<string, unknown>
  await updateDocumentIngest(documentId, {
    ingest_stage: "parsing",
    status: "processing",
    ingest_error: null,
    parsed_tables: {
      ...pt,
      processing_started_at: new Date().toISOString(),
    },
  })
}

/** Se já tem trechos mas a Vercel cortou no embed, libera como pronto (busca lexical). */
export async function tryFinalizeReadyIfChunked(
  documentId: string
): Promise<boolean> {
  const { count, error } = await supabaseServer
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)

  if (error || !count || count < 1) return false

  await updateDocumentIngest(documentId, {
    ingest_stage: "ready",
    status: "ready",
    ingest_error: null,
    chunk_count: count,
    last_ingested_at: new Date().toISOString(),
  })
  return true
}

const PIPELINE_TIMEOUT_MS = 52_000
const MAX_EMBED_BATCHES_PER_RUN = 5

export function isIngestTimeoutError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /timeout|timed out|TIMEOUT|FUNCTION_INVOCATION_TIMEOUT/i.test(msg)
}

export async function ingestDocumentPipelineWithTimeout(
  userId: string,
  documentId: string,
  timeoutMs = PIPELINE_TIMEOUT_MS
) {
  return Promise.race([
    ingestDocumentPipeline(userId, documentId),
    new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              "TIMEOUT: PDF grande demais para uma execução na Vercel. Será marcado como erro e a fila segue."
            )
          ),
        timeoutMs
      )
    }),
  ])
}

async function updateDocumentIngest(
  documentId: string,
  patch: Record<string, unknown>
) {
  const { error } = await supabaseServer
    .from("subject_documents")
    .update(patch)
    .eq("id", documentId)
  if (error) {
    const minimal: Record<string, unknown> = {}
    if (patch.status != null) minimal.status = patch.status
    if (patch.parsed_tables != null) minimal.parsed_tables = patch.parsed_tables
    if (Object.keys(minimal).length) {
      await supabaseServer.from("subject_documents").update(minimal).eq("id", documentId)
    }
  }
}

export async function getDocumentById(userId: string, documentId: string) {
  const { data, error } = await supabaseServer
    .from("subject_documents")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function loadDocumentText(
  documentId: string,
  doc?: { parsed_tables?: Record<string, unknown> | null }
): Promise<string> {
  const { data: row } = await supabaseServer
    .from("document_source_text")
    .select("content")
    .eq("document_id", documentId)
    .maybeSingle()

  if (row?.content) return row.content

  const pt = (doc?.parsed_tables ?? {}) as { full_text?: string; text_excerpt?: string }
  return String(pt.full_text ?? pt.text_excerpt ?? "")
}

export async function hasStoredDocumentText(
  documentId: string,
  doc?: { parsed_tables?: Record<string, unknown> | null }
): Promise<boolean> {
  const text = await loadDocumentText(documentId, doc)
  return text.trim().length >= MIN_CHUNK
}

export async function parseDocumentFromStorage(
  userId: string,
  documentId: string
): Promise<{ char_count: number; page_count: number }> {
  const doc = await getDocumentById(userId, documentId)
  if (!doc?.file_path) throw new Error("Arquivo não encontrado no storage")

  await updateDocumentIngest(documentId, {
    ingest_stage: "parsing",
    status: "processing",
    ingest_error: null,
  })

  const { data: blob, error: dlErr } = await supabaseServer.storage
    .from(COACH_DOCS_BUCKET)
    .download(doc.file_path)

  if (dlErr || !blob) throw new Error(dlErr?.message ?? "Download falhou")

  const buffer = Buffer.from(await blob.arrayBuffer())
  const text = await extractPdfTextWithTimeout(buffer)
  if (!text.trim()) {
    throw new Error("PDF sem texto extraível (pode ser scan)")
  }

  const pages = splitIntoPages(text)
  const excerpt = text.slice(0, 12_000)

  const { error: textErr } = await supabaseServer.from("document_source_text").upsert({
    document_id: documentId,
    content: text,
    page_count: pages.length,
    updated_at: new Date().toISOString(),
  })

  if (textErr) {
    const pt = (doc.parsed_tables ?? {}) as Record<string, unknown>
    await updateDocumentIngest(documentId, {
      parsed_tables: {
        ...pt,
        format: "pdf",
        text_excerpt: excerpt,
        full_text: text.slice(0, 500_000),
        char_count: text.length,
        page_count: pages.length,
      },
    })
  } else {
    await updateDocumentIngest(documentId, {
      parsed_tables: {
        format: "pdf",
        text_excerpt: excerpt,
        char_count: text.length,
        page_count: pages.length,
        text_in_table: true,
      },
      char_count: text.length,
      page_count: pages.length,
    })
  }

  return { char_count: text.length, page_count: pages.length }
}

export async function chunkDocument(
  userId: string,
  documentId: string
): Promise<{ chunks: number }> {
  const doc = await getDocumentById(userId, documentId)
  if (!doc) throw new Error("Documento não encontrado")

  await updateDocumentIngest(documentId, { ingest_stage: "chunking" })

  const text = await loadDocumentText(documentId, doc)
  if (!text.trim()) {
    await updateDocumentIngest(documentId, {
      ingest_stage: "failed",
      status: "failed",
      ingest_error: "Sem texto para indexar",
    })
    return { chunks: 0 }
  }

  await supabaseServer.from("document_chunks").delete().eq("document_id", documentId)

  const parts = buildChunksFromText(text, {
    document_id: documentId,
    title: doc.title,
    subject_id: doc.subject_id,
    doc_type: doc.doc_type,
  })

  if (!parts.length) {
    await updateDocumentIngest(documentId, {
      ingest_stage: "failed",
      status: "failed",
      ingest_error: "Nenhum trecho gerado",
      chunk_count: 0,
    })
    return { chunks: 0 }
  }

  for (let i = 0; i < parts.length; i += 100) {
    const batch = parts.slice(i, i + 100).map((p) => ({
      document_id: documentId,
      content: p.content,
      metadata: p.metadata,
    }))
    const { error } = await supabaseServer.from("document_chunks").insert(batch)
    if (error) throw new Error(error.message)
  }

  await updateDocumentIngest(documentId, {
    chunk_count: parts.length,
    last_ingested_at: new Date().toISOString(),
  })

  return { chunks: parts.length }
}

export type RagDocStatus = "no_chunks" | "complete" | "lexical_only" | "partial"

export async function getChunkEmbedCounts(
  documentId: string
): Promise<{ total: number; embedded: number }> {
  const { count: total, error: e1 } = await supabaseServer
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)

  if (e1) throw new Error(e1.message)

  const { count: embedded, error: e2 } = await supabaseServer
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .not("embedding", "is", null)

  if (e2) throw new Error(e2.message)

  return { total: total ?? 0, embedded: embedded ?? 0 }
}

export function ragStatusFromCounts(
  total: number,
  embedded: number
): RagDocStatus {
  if (total === 0) return "no_chunks"
  if (embedded === total) return "complete"
  if (embedded === 0) return "lexical_only"
  return "partial"
}

async function persistRagMetadata(
  documentId: string,
  doc: { parsed_tables?: Record<string, unknown> | null },
  counts: { total: number; embedded: number }
) {
  const pt = (doc.parsed_tables ?? {}) as Record<string, unknown>
  const rag_status = ragStatusFromCounts(counts.total, counts.embedded)
  await updateDocumentIngest(documentId, {
    parsed_tables: {
      ...pt,
      rag_status,
      embedded_count: counts.embedded,
      chunks_at_embed: counts.total,
      embedded_at: new Date().toISOString(),
    },
  })
}

/** Só vetoriza chunks existentes (sem re-parse). Falha se não houver OpenAI. */
export async function embedOnlyDocument(
  userId: string,
  documentId: string
): Promise<{ chunks: number; embedded: number }> {
  const doc = await getDocumentById(userId, documentId)
  if (!doc) throw new Error("Documento não encontrado")
  if (doc.ingest_stage !== "ready" && doc.ingest_stage !== "failed") {
    throw new Error("Só é possível vetorizar documentos prontos ou em retry")
  }

  const before = await getChunkEmbedCounts(documentId)
  if (before.total === 0) {
    throw new Error("Sem trechos para vetorizar — reindexe o PDF")
  }
  if (before.embedded === before.total) {
    await persistRagMetadata(documentId, doc, before)
    return { chunks: before.total, embedded: before.embedded }
  }

  const emb = await embedDocumentChunks(userId, documentId)
  if (emb.skipped) {
    const msg =
      "Configure chave OpenAI nas configurações do app para vetorizar (RAG)."
    await failDocumentIngest(documentId, msg)
    throw new Error(msg)
  }

  const after = await getChunkEmbedCounts(documentId)
  await persistRagMetadata(documentId, doc, after)

  await updateDocumentIngest(documentId, {
    ingest_stage: "ready",
    status: "ready",
    ingest_error: null,
    chunk_count: after.total,
  })

  return { chunks: after.total, embedded: after.embedded }
}

export async function embedDocumentChunks(
  userId: string,
  documentId: string
): Promise<{ embedded: number; skipped: boolean }> {
  const credentials = await getUserAiCredentials(userId)
  if (!credentials || credentials.provider !== "openai") {
    return { embedded: 0, skipped: true }
  }

  await updateDocumentIngest(documentId, { ingest_stage: "embedding" })

  const { data: chunks, error } = await supabaseServer
    .from("document_chunks")
    .select("id, content, embedding")
    .eq("document_id", documentId)
    .is("embedding", null)
    .limit(500)

  if (error || !chunks?.length) {
    return { embedded: 0, skipped: false }
  }

  let embedded = 0
  let batches = 0
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    if (batches >= MAX_EMBED_BATCHES_PER_RUN) break
    batches++
    const batch = chunks.slice(i, i + EMBED_BATCH)
    const vectors = await embedTexts(
      batch.map((c) => c.content),
      credentials
    )
    await Promise.all(
      batch.map(async (chunk, j) => {
        const vec = vectors[j]
        if (!vec) return
        const { error: upErr } = await supabaseServer
          .from("document_chunks")
          .update({ embedding: vec as unknown as string })
          .eq("id", chunk.id)
        if (!upErr) embedded++
      })
    )
  }

  return { embedded, skipped: false }
}

export async function ingestDocumentPipeline(
  userId: string,
  documentId: string,
  options?: { skipEmbed?: boolean; skipParse?: boolean }
): Promise<{
  chunks: number
  embedded: number
  page_count?: number
  char_count?: number
}> {
  try {
    const doc = await getDocumentById(userId, documentId)
    if (!doc) throw new Error("Documento não encontrado")

    let page_count = Number(doc.page_count ?? 0)
    let char_count = Number(doc.char_count ?? 0)

    const skipParse =
      options?.skipParse ?? (await hasStoredDocumentText(documentId, doc))

    if (!skipParse) {
      const parsed = await parseDocumentFromStorage(userId, documentId)
      page_count = parsed.page_count
      char_count = parsed.char_count
    } else {
      const text = await loadDocumentText(documentId, doc)
      char_count = text.length
      if (!page_count) {
        const pt = (doc.parsed_tables ?? {}) as { page_count?: number }
        page_count = Number(pt.page_count ?? 0)
      }
    }

    const { chunks } = await chunkDocument(userId, documentId)

    let embedded = 0
    if (!options?.skipEmbed && chunks > 0) {
      try {
        const emb = await embedDocumentChunks(userId, documentId)
        embedded = emb.embedded
      } catch {
        /* lexical search still works without embeddings */
      }
    }

    const docAfter = await getDocumentById(userId, documentId)
    const counts = await getChunkEmbedCounts(documentId)
    if (docAfter) await persistRagMetadata(documentId, docAfter, counts)

    await updateDocumentIngest(documentId, {
      ingest_stage: "ready",
      status: "ready",
      ingest_error: null,
      chunk_count: chunks,
    })

    return {
      chunks,
      embedded,
      page_count: page_count || undefined,
      char_count: char_count || undefined,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na ingestão"
    await updateDocumentIngest(documentId, {
      ingest_stage: "failed",
      status: "failed",
      ingest_error: msg,
    })
    throw e
  }
}

export async function ingestDocumentBatch(
  userId: string,
  documentIds: string[],
  concurrency = 2
): Promise<{ ok: number; failed: number; results: Record<string, unknown>[] }> {
  const results: Record<string, unknown>[] = []
  let ok = 0
  let failed = 0
  let idx = 0

  async function worker() {
    while (idx < documentIds.length) {
      const i = idx++
      const docId = documentIds[i]!
      try {
        const r = await ingestDocumentPipeline(userId, docId)
        results.push({ document_id: docId, ...r })
        ok++
      } catch (e) {
        results.push({
          document_id: docId,
          error: e instanceof Error ? e.message : "Erro",
        })
        failed++
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, documentIds.length) }, () =>
    worker()
  )
  await Promise.all(workers)
  return { ok, failed, results }
}

export async function findDuplicateStudyMaterial(
  userId: string,
  subjectId: string,
  sha256: string
): Promise<string | null> {
  const { data } = await supabaseServer
    .from("subject_documents")
    .select("id")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .eq("doc_type", "study_material")
    .eq("file_sha256", sha256)
    .maybeSingle()
  return data?.id ?? null
}

export async function listReadyMaterialDocIds(
  userId: string,
  subjectId: string
): Promise<string[]> {
  const docs = await listCoachDocuments(userId, {
    subjectId,
    docType: "study_material",
  })
  return docs
    .filter((d) => {
      const stage = (d as { ingest_stage?: string }).ingest_stage
      const chunks = Number((d as { chunk_count?: number }).chunk_count ?? 0)
      return d.status === "ready" || stage === "ready" || chunks > 0
    })
    .map((d) => d.id)
}
