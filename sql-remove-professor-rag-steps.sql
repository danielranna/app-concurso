-- Remoção RAG em ETAPAS (evita timeout no Supabase SQL Editor)
-- Rode cada bloco separadamente, na ordem. Espere "Success" antes do próximo.
-- Deploy do app SEM referência a document_chunks deve estar no ar antes.

-- =============================================================================
-- ETAPA 0 — inventário (opcional, rápido)
-- =============================================================================
-- SELECT doc_type, COUNT(*) FROM subject_documents GROUP BY doc_type;
-- SELECT COUNT(*) AS chunks FROM document_chunks;
-- SELECT COUNT(*) AS source_rows FROM document_source_text;


-- =============================================================================
-- ETAPA 1 — jobs de ingest (rápido)
-- =============================================================================
DELETE FROM ai_jobs
WHERE job_type IN (
  'document_parse',
  'document_chunk',
  'document_embed',
  'document_ingest',
  'document_batch_ingest'
);


-- =============================================================================
-- ETAPA 2 — remover índices de document_chunks (1 comando por vez se precisar)
-- =============================================================================
DROP INDEX IF EXISTS idx_document_chunks_embedding;
DROP INDEX IF EXISTS idx_document_chunks_search;


-- =============================================================================
-- ETAPA 3a — tentar TRUNCATE (geralmente segundos; se timeout, use 3b)
-- =============================================================================
TRUNCATE TABLE document_chunks;
TRUNCATE TABLE document_source_text;


-- =============================================================================
-- ETAPA 3b — só se 3a deu timeout: apagar chunks em lotes
-- Repita este bloco até "DELETE 0" (ou quase 0)
-- =============================================================================
-- DELETE FROM document_chunks
-- WHERE id IN (
--   SELECT id FROM document_chunks LIMIT 3000
-- );


-- =============================================================================
-- ETAPA 3c — se document_source_text ainda tiver linhas
-- =============================================================================
-- DELETE FROM document_source_text
-- WHERE document_id IN (
--   SELECT document_id FROM document_source_text LIMIT 5000
-- );


-- =============================================================================
-- ETAPA 4 — PDFs study_material (rápido DEPOIS de esvaziar chunks)
-- NÃO rode DELETE em subject_documents antes do TRUNCATE dos chunks!
-- =============================================================================
DELETE FROM subject_documents WHERE doc_type = 'study_material';


-- =============================================================================
-- ETAPA 5 — dropar função e tabelas (vazias ou quase vazias = rápido)
-- =============================================================================
DROP FUNCTION IF EXISTS match_document_chunks(vector(1536), uuid[], integer);
DROP TABLE IF EXISTS document_chunks;
DROP TABLE IF EXISTS document_source_text;


-- =============================================================================
-- ETAPA 6 — colunas de ingest (rápido)
-- =============================================================================
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


-- =============================================================================
-- ETAPA 7 — conferir tamanho (opcional)
-- =============================================================================
-- SELECT schemaname, relname, pg_size_pretty(pg_total_relation_size(relid))
-- FROM pg_catalog.pg_statio_user_tables
-- ORDER BY pg_total_relation_size(relid) DESC
-- LIMIT 20;

-- Dashboard → Database → maintenance / vacuum para o espaço aparecer no plano.
