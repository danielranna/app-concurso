-- Agente Professor: metadados de ingestão e texto fora do JSONB

ALTER TABLE subject_documents
  ADD COLUMN IF NOT EXISTS file_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS page_count INTEGER,
  ADD COLUMN IF NOT EXISTS char_count INTEGER,
  ADD COLUMN IF NOT EXISTS ingest_stage TEXT DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS ingest_error TEXT,
  ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ingested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS material_tags JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_subject_documents_ingest
  ON subject_documents(user_id, subject_id, ingest_stage)
  WHERE doc_type = 'study_material';

CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_documents_dedupe
  ON subject_documents(user_id, subject_id, file_sha256)
  WHERE doc_type = 'study_material' AND file_sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS document_source_text (
  document_id UUID PRIMARY KEY REFERENCES subject_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  page_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_source_text_updated
  ON document_source_text(updated_at DESC);
