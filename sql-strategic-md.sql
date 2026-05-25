-- Importação de análise estratégica em Markdown (template fixo)
-- Execute após sql-ai-coaching.sql e sql-incidence-rows.sql

ALTER TABLE subject_documents
  DROP CONSTRAINT IF EXISTS subject_documents_doc_type_check;

ALTER TABLE subject_documents
  ADD CONSTRAINT subject_documents_doc_type_check
  CHECK (doc_type IN ('edital', 'incidence', 'study_material', 'strategic_md'));

-- Enriquecimento IA (hierarquia, nucleares, previsibilidade)
ALTER TABLE exam_edital_analysis
  ADD COLUMN IF NOT EXISTS enrichment JSONB NOT NULL DEFAULT '{}'::jsonb;
