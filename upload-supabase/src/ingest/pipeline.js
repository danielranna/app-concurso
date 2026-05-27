/** Sync com lib/ai/document-ingest.ts — sem limite de 52s / 5 lotes de embed. */
import { extractPdfTextWithTimeout } from "./pdf-extract.js"
import { embedTexts } from "./embeddings.js"
import { getUserAiCredentials } from "./user-credentials.js"

const PAGE_TARGET_CHARS = 2800
const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 200
const MIN_CHUNK = 80
const EMBED_BATCH = 40

export function splitIntoPages(text) {
  const byFf = text
    .split(/\f+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_CHUNK)
  if (byFf.length > 1) return byFf

  const pages = []
  for (let i = 0; i < text.length; i += PAGE_TARGET_CHARS) {
    const slice = text.slice(i, i + PAGE_TARGET_CHARS).trim()
    if (slice.length >= MIN_CHUNK) pages.push(slice)
  }
  return pages.length ? pages : text.trim().length >= MIN_CHUNK ? [text.trim()] : []
}

export function chunkPageText(pageText) {
  if (pageText.length <= CHUNK_SIZE + 100) {
    return pageText.length >= MIN_CHUNK ? [pageText] : []
  }
  const chunks = []
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

export function buildChunksFromText(text, meta) {
  const pages = splitIntoPages(text)
  const rows = []
  let globalIndex = 0

  for (let pageNum = 0; pageNum < pages.length; pageNum++) {
    const pageParts = chunkPageText(pages[pageNum])
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

async function updateDocumentIngest(supabase, documentId, patch) {
  const { error } = await supabase
    .from("subject_documents")
    .update(patch)
    .eq("id", documentId)
  if (error) {
    const minimal = {}
    if (patch.status != null) minimal.status = patch.status
    if (patch.parsed_tables != null) minimal.parsed_tables = patch.parsed_tables
    if (Object.keys(minimal).length) {
      await supabase.from("subject_documents").update(minimal).eq("id", documentId)
    }
  }
}

export async function failDocumentIngest(supabase, documentId, message) {
  await updateDocumentIngest(supabase, documentId, {
    ingest_stage: "failed",
    status: "failed",
    ingest_error: message.slice(0, 500),
  })
}

export async function markProcessingStarted(supabase, userId, documentId) {
  const doc = await getDocumentById(supabase, userId, documentId)
  const pt = doc?.parsed_tables ?? {}
  await updateDocumentIngest(supabase, documentId, {
    ingest_stage: "parsing",
    status: "processing",
    ingest_error: null,
    parsed_tables: {
      ...pt,
      processing_started_at: new Date().toISOString(),
    },
  })
}

export async function tryFinalizeReadyIfChunked(supabase, documentId) {
  const { count, error } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)

  if (error || !count || count < 1) return false

  await updateDocumentIngest(supabase, documentId, {
    ingest_stage: "ready",
    status: "ready",
    ingest_error: null,
    chunk_count: count,
    last_ingested_at: new Date().toISOString(),
  })
  return true
}

export function isIngestTimeoutError(e) {
  const msg = e instanceof Error ? e.message : String(e)
  return /timeout|timed out|TIMEOUT/i.test(msg)
}

export async function getDocumentById(supabase, userId, documentId) {
  const { data, error } = await supabase
    .from("subject_documents")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function loadDocumentText(supabase, documentId, doc) {
  const { data: row } = await supabase
    .from("document_source_text")
    .select("content")
    .eq("document_id", documentId)
    .maybeSingle()

  if (row?.content) return row.content

  const pt = doc?.parsed_tables ?? {}
  return String(pt.full_text ?? pt.text_excerpt ?? "")
}

export async function parseDocumentFromStorage(
  supabase,
  config,
  userId,
  documentId
) {
  const doc = await getDocumentById(supabase, userId, documentId)
  if (!doc?.file_path) throw new Error("Arquivo não encontrado no storage")

  await updateDocumentIngest(supabase, documentId, {
    ingest_stage: "parsing",
    status: "processing",
    ingest_error: null,
  })

  const { data: blob, error: dlErr } = await supabase.storage
    .from(config.bucket)
    .download(doc.file_path)

  if (dlErr || !blob) throw new Error(dlErr?.message ?? "Download falhou")

  const buffer = Buffer.from(await blob.arrayBuffer())
  const text = await extractPdfTextWithTimeout(
    buffer,
    config.ingestPdfTimeoutMs
  )
  if (!text.trim()) {
    throw new Error("PDF sem texto extraível (pode ser scan)")
  }

  const pages = splitIntoPages(text)
  const excerpt = text.slice(0, 12_000)

  const { error: textErr } = await supabase.from("document_source_text").upsert({
    document_id: documentId,
    content: text,
    page_count: pages.length,
    updated_at: new Date().toISOString(),
  })

  if (textErr) {
    const pt = doc.parsed_tables ?? {}
    await updateDocumentIngest(supabase, documentId, {
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
    await updateDocumentIngest(supabase, documentId, {
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

export async function chunkDocument(supabase, userId, documentId) {
  const doc = await getDocumentById(supabase, userId, documentId)
  if (!doc) throw new Error("Documento não encontrado")

  await updateDocumentIngest(supabase, documentId, { ingest_stage: "chunking" })

  const text = await loadDocumentText(supabase, documentId, doc)
  if (!text.trim()) {
    await updateDocumentIngest(supabase, documentId, {
      ingest_stage: "failed",
      status: "failed",
      ingest_error: "Sem texto para indexar",
    })
    return { chunks: 0 }
  }

  await supabase.from("document_chunks").delete().eq("document_id", documentId)

  const parts = buildChunksFromText(text, {
    document_id: documentId,
    title: doc.title,
    subject_id: doc.subject_id,
    doc_type: doc.doc_type,
  })

  if (!parts.length) {
    await updateDocumentIngest(supabase, documentId, {
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
    const { error } = await supabase.from("document_chunks").insert(batch)
    if (error) throw new Error(error.message)
  }

  await updateDocumentIngest(supabase, documentId, {
    chunk_count: parts.length,
    last_ingested_at: new Date().toISOString(),
  })

  return { chunks: parts.length }
}

export function ragStatusFromCounts(total, embedded) {
  if (total === 0) return "no_chunks"
  if (embedded === total) return "complete"
  if (embedded === 0) return "lexical_only"
  return "partial"
}

export async function getChunkEmbedCounts(supabase, documentId) {
  const { count: total, error: e1 } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)

  if (e1) throw new Error(e1.message)

  const { count: embedded, error: e2 } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .not("embedding", "is", null)

  if (e2) throw new Error(e2.message)

  return { total: total ?? 0, embedded: embedded ?? 0 }
}

async function persistRagMetadata(supabase, documentId, doc, counts) {
  const pt = doc.parsed_tables ?? {}
  const rag_status = ragStatusFromCounts(counts.total, counts.embedded)
  await updateDocumentIngest(supabase, documentId, {
    parsed_tables: {
      ...pt,
      rag_status,
      embedded_count: counts.embedded,
      chunks_at_embed: counts.total,
      embedded_at: new Date().toISOString(),
    },
  })
}

/** Só vetoriza chunks existentes (sem re-parse). */
export async function embedOnlyDocument(supabase, config, userId, documentId) {
  const doc = await getDocumentById(supabase, userId, documentId)
  if (!doc) throw new Error("Documento não encontrado")
  if (doc.ingest_stage !== "ready") {
    throw new Error("Só é possível vetorizar documentos já indexados (ready)")
  }

  const before = await getChunkEmbedCounts(supabase, documentId)
  if (before.total === 0) {
    throw new Error("Sem trechos para vetorizar — reindexe o PDF")
  }
  if (before.embedded === before.total) {
    await persistRagMetadata(supabase, documentId, doc, before)
    return { chunks: before.total, embedded: before.embedded }
  }

  const emb = await embedDocumentChunks(supabase, config, userId, documentId)
  if (emb.skipped) {
    const msg =
      "Configure chave OpenAI nas configurações do app para vetorizar (RAG)."
    await failDocumentIngest(supabase, documentId, msg)
    throw new Error(msg)
  }

  const after = await getChunkEmbedCounts(supabase, documentId)
  await persistRagMetadata(supabase, documentId, doc, after)

  await updateDocumentIngest(supabase, documentId, {
    ingest_stage: "ready",
    status: "ready",
    ingest_error: null,
    chunk_count: after.total,
  })

  return { chunks: after.total, embedded: after.embedded }
}

/** Vetoriza todos os chunks sem limite de lotes por execução (VPS). */
export async function embedDocumentChunks(supabase, config, userId, documentId) {
  const credentials = await getUserAiCredentials(supabase, config, userId)
  if (!credentials || credentials.provider !== "openai") {
    return { embedded: 0, skipped: true }
  }

  await updateDocumentIngest(supabase, documentId, { ingest_stage: "embedding" })

  let embedded = 0

  while (true) {
    const { data: chunks, error } = await supabase
      .from("document_chunks")
      .select("id, content, embedding")
      .eq("document_id", documentId)
      .is("embedding", null)
      .limit(500)

    if (error) throw new Error(error.message)
    if (!chunks?.length) break

    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH)
      const vectors = await embedTexts(
        batch.map((c) => c.content),
        credentials
      )
      await Promise.all(
        batch.map(async (chunk, j) => {
          const vec = vectors[j]
          if (!vec) return
          const { error: upErr } = await supabase
            .from("document_chunks")
            .update({ embedding: vec })
            .eq("id", chunk.id)
          if (!upErr) embedded++
        })
      )
    }
  }

  return { embedded, skipped: false }
}

export async function ingestDocumentPipeline(
  supabase,
  config,
  userId,
  documentId,
  options = {}
) {
  try {
    const parsed = await parseDocumentFromStorage(
      supabase,
      config,
      userId,
      documentId
    )
    const { chunks } = await chunkDocument(supabase, userId, documentId)

    let embedded = 0
    if (!options.skipEmbed && chunks > 0) {
      try {
        const emb = await embedDocumentChunks(
          supabase,
          config,
          userId,
          documentId
        )
        embedded = emb.embedded
      } catch {
        /* busca lexical funciona sem embeddings */
      }
    }

    const docAfter = await getDocumentById(supabase, userId, documentId)
    const counts = await getChunkEmbedCounts(supabase, documentId)
    if (docAfter) await persistRagMetadata(supabase, documentId, docAfter, counts)

    await updateDocumentIngest(supabase, documentId, {
      ingest_stage: "ready",
      status: "ready",
      ingest_error: null,
      chunk_count: chunks,
    })

    return {
      chunks,
      embedded,
      page_count: parsed.page_count,
      char_count: parsed.char_count,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na ingestão"
    await updateDocumentIngest(supabase, documentId, {
      ingest_stage: "failed",
      status: "failed",
      ingest_error: msg,
    })
    throw e
  }
}
