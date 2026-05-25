import { supabaseServer } from "../supabase-server"
import { documentTextExcerpt, listCoachDocuments } from "../coach-documents"
import {
  buildChunksFromText,
  ingestDocumentPipeline,
  loadDocumentText,
} from "./document-ingest"
import { retrieveForTeacher, type RetrievedChunk } from "./teacher-retrieval"

export { ingestDocumentPipeline as ingestDocumentChunks }

export async function searchDocumentChunks(
  userId: string,
  subjectId: string,
  query: string,
  limit = 5
): Promise<{ title: string; content: string; document_id: string }[]> {
  const hits = await retrieveForTeacher(userId, subjectId, query, limit)
  return hits.map((h) => ({
    title: h.title,
    content: h.content,
    document_id: h.document_id,
  }))
}

export type { RetrievedChunk }

/** Legado: re-chunk a partir de texto já no doc (sem re-parse do PDF). */
export async function rechunkFromStoredText(
  userId: string,
  documentId: string
): Promise<{ chunks: number }> {
  const docs = await listCoachDocuments(userId, {})
  const doc = docs.find((d) => d.id === documentId)
  if (!doc) throw new Error("Documento não encontrado")

  const text = await loadDocumentText(documentId, doc)
  if (!text.trim()) return { chunks: 0 }

  await supabaseServer.from("document_chunks").delete().eq("document_id", documentId)

  const parts = buildChunksFromText(text, {
    document_id: documentId,
    title: doc.title,
    subject_id: doc.subject_id,
    doc_type: doc.doc_type,
  })

  if (parts.length) {
    for (let i = 0; i < parts.length; i += 100) {
      const batch = parts.slice(i, i + 100).map((p) => ({
        document_id: documentId,
        content: p.content,
        metadata: p.metadata,
      }))
      const { error } = await supabaseServer.from("document_chunks").insert(batch)
      if (error) throw new Error(error.message)
    }
  }

  await supabaseServer
    .from("subject_documents")
    .update({ status: "ready", chunk_count: parts.length })
    .eq("id", documentId)

  return { chunks: parts.length }
}

export async function documentTextExcerptAsync(
  doc: { id: string; parsed_tables?: Record<string, unknown> | null }
): Promise<string> {
  const fromTable = await loadDocumentText(doc.id, doc)
  if (fromTable) return fromTable
  return documentTextExcerpt(doc)
}
