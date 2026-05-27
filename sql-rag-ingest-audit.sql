-- Auditoria RAG: quais PDFs têm vetores de verdade (substitua USER_ID)
-- Resumo por status:
SELECT rag_status, COUNT(*) AS qtd
FROM (
  SELECT
    CASE
      WHEN COUNT(dc.id) = 0 THEN 'sem_chunks'
      WHEN COUNT(dc.embedding) = COUNT(dc.id) THEN 'rag_completo'
      WHEN COUNT(dc.embedding) = 0 THEN 'so_texto'
      ELSE 'vetor_parcial'
    END AS rag_status
  FROM subject_documents sd
  LEFT JOIN document_chunks dc ON dc.document_id = sd.id
  WHERE sd.user_id = 'USER_ID'
    AND sd.doc_type = 'study_material'
  GROUP BY sd.id
) t
GROUP BY rag_status
ORDER BY rag_status;

-- Detalhe por documento:
SELECT
  sd.id,
  sd.title,
  sd.ingest_stage,
  sd.chunk_count,
  COUNT(dc.id) AS chunks_db,
  COUNT(dc.embedding) AS chunks_com_vetor,
  CASE
    WHEN COUNT(dc.id) = 0 THEN 'sem_chunks'
    WHEN COUNT(dc.embedding) = COUNT(dc.id) THEN 'rag_completo'
    WHEN COUNT(dc.embedding) = 0 THEN 'so_texto'
    ELSE 'vetor_parcial'
  END AS rag_status
FROM subject_documents sd
LEFT JOIN document_chunks dc ON dc.document_id = sd.id
WHERE sd.user_id = 'USER_ID'
  AND sd.doc_type = 'study_material'
GROUP BY sd.id, sd.title, sd.ingest_stage, sd.chunk_count
ORDER BY rag_status, sd.title;
