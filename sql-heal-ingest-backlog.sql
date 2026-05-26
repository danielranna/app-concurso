-- Normaliza PDFs de estudo travados sem chunks (rodar uma vez no Supabase SQL Editor).
-- Ajuste user_id se quiser limitar a um usuário.

UPDATE subject_documents
SET ingest_stage = 'uploaded',
    status = 'pending',
    ingest_error = NULL
WHERE doc_type = 'study_material'
  AND ingest_stage IN ('parsing', 'chunking', 'embedding')
  AND id NOT IN (
    SELECT DISTINCT document_id FROM document_chunks
  );
