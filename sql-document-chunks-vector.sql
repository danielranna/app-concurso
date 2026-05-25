-- Fase 2: embeddings para busca híbrida (pgvector no Supabase)

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
  ON document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Inclui título do material no índice lexical
DROP INDEX IF EXISTS idx_document_chunks_search;

ALTER TABLE document_chunks
  DROP COLUMN IF EXISTS search_vector;

ALTER TABLE document_chunks
  ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'portuguese',
        coalesce(content, '') || ' ' || coalesce(metadata->>'title', '')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_document_chunks_search
  ON document_chunks USING GIN (search_vector);

CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_document_ids uuid[],
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  content text,
  document_id uuid,
  metadata jsonb,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.content,
    c.document_id,
    c.metadata,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM document_chunks c
  WHERE c.document_id = ANY(match_document_ids)
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
