import { supabaseServer } from "../supabase-server"
import { documentTextExcerpt, listCoachDocuments } from "../coach-documents"

const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 200

function splitText(text: string): string[] {
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    const end = Math.min(i + CHUNK_SIZE, text.length)
    chunks.push(text.slice(i, end).trim())
    i += CHUNK_SIZE - CHUNK_OVERLAP
    if (end >= text.length) break
  }
  return chunks.filter((c) => c.length > 80)
}

export async function ingestDocumentChunks(
  userId: string,
  documentId: string
): Promise<{ chunks: number }> {
  const docs = await listCoachDocuments(userId, {})
  const doc = docs.find((d) => d.id === documentId)
  if (!doc) throw new Error("Documento não encontrado")

  const text = documentTextExcerpt(doc)
  if (!text.trim()) return { chunks: 0 }

  await supabaseServer
    .from("document_chunks")
    .delete()
    .eq("document_id", documentId)

  const parts = splitText(text)
  if (!parts.length) return { chunks: 0 }

  const rows = parts.map((content, idx) => ({
    document_id: documentId,
    content,
    metadata: { chunk_index: idx, title: doc.title, doc_type: doc.doc_type },
  }))

  const { error } = await supabaseServer.from("document_chunks").insert(rows)
  if (error) throw new Error(error.message)

  await supabaseServer
    .from("subject_documents")
    .update({ status: "ready" })
    .eq("id", documentId)

  return { chunks: parts.length }
}

export async function searchDocumentChunks(
  userId: string,
  subjectId: string,
  query: string,
  limit = 5
): Promise<{ title: string; content: string; document_id: string }[]> {
  const docs = await listCoachDocuments(userId, {
    subjectId,
    docType: "study_material",
  })
  const docIds = docs.map((d) => d.id)
  if (!docIds.length) return []

  const terms = query
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 8)
    .join(" & ")

  if (!terms) {
    const { data } = await supabaseServer
      .from("document_chunks")
      .select("content, document_id, metadata")
      .in("document_id", docIds)
      .limit(limit)

    return (data ?? []).map((c) => ({
      title: String((c.metadata as { title?: string })?.title ?? "Material"),
      content: c.content,
      document_id: c.document_id,
    }))
  }

  const { data, error } = await supabaseServer
    .from("document_chunks")
    .select("content, document_id, metadata")
    .in("document_id", docIds)
    .textSearch("search_vector", terms, { type: "websearch", config: "portuguese" })
    .limit(limit)

  if (error || !data?.length) {
    const q = query.toLowerCase()
    const { data: fallback } = await supabaseServer
      .from("document_chunks")
      .select("content, document_id, metadata")
      .in("document_id", docIds)
      .ilike("content", `%${q.slice(0, 40)}%`)
      .limit(limit)

    return (fallback ?? []).map((c) => ({
      title: String((c.metadata as { title?: string })?.title ?? "Material"),
      content: c.content,
      document_id: c.document_id,
    }))
  }

  return data.map((c) => ({
    title: String((c.metadata as { title?: string })?.title ?? "Material"),
    content: c.content,
    document_id: c.document_id,
  }))
}
