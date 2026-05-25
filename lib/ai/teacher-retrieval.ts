import { supabaseServer } from "../supabase-server"
import { listCoachDocuments } from "../coach-documents"
import { embedTexts } from "./embeddings"
import { getUserAiCredentials } from "./user-credentials"
import { listReadyMaterialDocIds } from "./document-ingest"

export type RetrievedChunk = {
  title: string
  content: string
  document_id: string
  page?: number
  score?: number
}

function mapChunkRow(c: {
  content: string
  document_id: string
  metadata?: Record<string, unknown> | null
}): RetrievedChunk {
  const meta = (c.metadata ?? {}) as { title?: string; page?: number }
  return {
    title: meta.title ?? "Material",
    content: c.content,
    document_id: c.document_id,
    page: meta.page as number | undefined,
  }
}

async function lexicalSearch(
  docIds: string[],
  query: string,
  limit: number
): Promise<RetrievedChunk[]> {
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
    return (data ?? []).map(mapChunkRow)
  }

  const { data, error } = await supabaseServer
    .from("document_chunks")
    .select("content, document_id, metadata")
    .in("document_id", docIds)
    .textSearch("search_vector", terms, { type: "websearch", config: "portuguese" })
    .limit(limit)

  if (!error && data?.length) {
    return data.map(mapChunkRow)
  }

  const q = query.toLowerCase().slice(0, 40)
  const { data: fallback } = await supabaseServer
    .from("document_chunks")
    .select("content, document_id, metadata")
    .in("document_id", docIds)
    .ilike("content", `%${q}%`)
    .limit(limit)

  return (fallback ?? []).map(mapChunkRow)
}

async function vectorSearch(
  userId: string,
  docIds: string[],
  query: string,
  limit: number
): Promise<RetrievedChunk[]> {
  const credentials = await getUserAiCredentials(userId)
  if (!credentials || credentials.provider !== "openai") return []

  try {
    const [queryVec] = await embedTexts([query], credentials)
    if (!queryVec) return []

    const { data, error } = await supabaseServer.rpc("match_document_chunks", {
      query_embedding: queryVec,
      match_document_ids: docIds,
      match_count: Math.max(limit * 3, 15),
    })

    if (error || !data?.length) return []

    return (data as { content: string; document_id: string; metadata: Record<string, unknown>; similarity: number }[]).map(
      (row) => ({
        ...mapChunkRow(row),
        score: row.similarity,
      })
    )
  } catch {
    return []
  }
}

function rerankHybrid(
  vectorHits: RetrievedChunk[],
  lexicalHits: RetrievedChunk[],
  limit: number
): RetrievedChunk[] {
  const byKey = new Map<string, RetrievedChunk & { _score: number }>()

  for (const hit of vectorHits) {
    const key = `${hit.document_id}:${hit.content.slice(0, 80)}`
    byKey.set(key, { ...hit, _score: (hit.score ?? 0.5) * 1.2 })
  }
  for (let i = 0; i < lexicalHits.length; i++) {
    const hit = lexicalHits[i]!
    const key = `${hit.document_id}:${hit.content.slice(0, 80)}`
    const prev = byKey.get(key)
    const boost = 1 - i * 0.05
    if (prev) prev._score += boost
    else byKey.set(key, { ...hit, _score: boost })
  }

  return [...byKey.values()]
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score: _s, ...rest }) => rest)
}

export async function retrieveForTeacher(
  userId: string,
  subjectId: string,
  query: string,
  limit = 6
): Promise<RetrievedChunk[]> {
  const docIds = await listReadyMaterialDocIds(userId, subjectId)
  if (!docIds.length) {
    const docs = await listCoachDocuments(userId, {
      subjectId,
      docType: "study_material",
    })
    const fallbackIds = docs.filter((d) => d.status === "ready").map((d) => d.id)
    if (!fallbackIds.length) return []
    return lexicalSearch(fallbackIds, query, limit)
  }

  const [vectorHits, lexicalHits] = await Promise.all([
    vectorSearch(userId, docIds, query, limit),
    lexicalSearch(docIds, query, limit),
  ])

  if (vectorHits.length) {
    return rerankHybrid(vectorHits, lexicalHits, limit)
  }
  return lexicalHits.slice(0, limit)
}
