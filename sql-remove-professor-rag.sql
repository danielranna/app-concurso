-- Remoção do Professor / RAG (~930 MB)
-- Executar APENAS após deploy do código que não referencia document_chunks.

-- Inventário (opcional, antes de apagar)
-- SELECT doc_type, COUNT(*) FROM subject_documents GROUP BY doc_type;
-- SELECT COUNT(*) AS chunks FROM document_chunks;
-- SELECT COUNT(*) AS source_rows FROM document_source_text;

-- 1) Cancelar jobs pendentes de ingest
DELETE FROM ai_jobs WHERE job_type IN (
  'document_parse',
  'document_chunk',
  'document_embed',
  'document_ingest',
  'document_batch_ingest'
);

-- 2) Apagar PDFs de estudo (CASCADE limpa chunks/text se ainda existir)
DELETE FROM subject_documents WHERE doc_type = 'study_material';

-- 3) Dropar RAG
DROP FUNCTION IF EXISTS match_document_chunks(vector, uuid[], int);
DROP TABLE IF EXISTS document_chunks CASCADE;
DROP TABLE IF EXISTS document_source_text CASCADE;

-- 4) Colunas só de ingest de material
ALTER TABLE subject_documents
  DROP COLUMN IF EXISTS file_sha256,
  DROP COLUMN IF EXISTS page_count,
  DROP COLUMN IF EXISTS char_count,
  DROP COLUMN IF EXISTS ingest_stage,
  DROP COLUMN IF EXISTS ingest_error,
  DROP COLUMN IF EXISTS chunk_count,
  DROP COLUMN IF EXISTS last_ingested_at,
  DROP COLUMN IF EXISTS material_tags;

-- 5) Preferências
ALTER TABLE coach_report_preferences
  DROP COLUMN IF EXISTS max_teacher_queries_per_day;

-- 6) Extensão vector — descomente se nada mais usar pgvector
-- DROP EXTENSION IF EXISTS vector;
