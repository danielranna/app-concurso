-- Remoção do Professor / RAG (~930 MB)
-- Executar APENAS após deploy do código que não referencia document_chunks.
--
-- Se der "upstream timeout" no SQL Editor, use:
--   sql-remove-professor-rag-steps.sql
-- (um bloco por vez; o passo 3 em loop até retornar 0 linhas)

-- Passo A — rápido
DELETE FROM ai_jobs
WHERE job_type IN (
  'document_parse',
  'document_chunk',
  'document_embed',
  'document_ingest',
  'document_batch_ingest'
);

-- Passo B — índices pesados (libera I/O antes do truncate)
DROP INDEX IF EXISTS idx_document_chunks_embedding;
DROP INDEX IF EXISTS idx_document_chunks_search;

-- Passo C — NÃO use DELETE em subject_documents antes disto (CASCADE = timeout)
TRUNCATE TABLE document_chunks;
TRUNCATE TABLE document_source_text;

-- Passo D — metadados dos PDFs (agora sem milhões de filhos)
DELETE FROM subject_documents WHERE doc_type = 'study_material';

-- Passo E — limpeza final
DROP FUNCTION IF EXISTS match_document_chunks(vector(1536), uuid[], integer);
DROP TABLE IF EXISTS document_chunks;
DROP TABLE IF EXISTS document_source_text;

ALTER TABLE subject_documents
  DROP COLUMN IF EXISTS file_sha256,
  DROP COLUMN IF EXISTS page_count,
  DROP COLUMN IF EXISTS char_count,
  DROP COLUMN IF EXISTS ingest_stage,
  DROP COLUMN IF EXISTS ingest_error,
  DROP COLUMN IF EXISTS chunk_count,
  DROP COLUMN IF EXISTS last_ingested_at,
  DROP COLUMN IF EXISTS material_tags;

ALTER TABLE coach_report_preferences
  DROP COLUMN IF EXISTS max_teacher_queries_per_day;

-- Opcional, só se nada mais usar pgvector:
-- DROP EXTENSION IF EXISTS vector;
