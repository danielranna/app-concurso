-- =============================================================================
-- Limpeza: remover do CADERNO questões sem conteúdo compartilhado vinculado
-- Escopo: somente matéria Língua Portuguesa (evita apagar o banco inteiro)
--
-- O que faz:
--   1) Remove linhas de notebook_questions (não apaga questions global por padrão)
--   2) Recalcula question_count dos cadernos afetados
--   3) (Opcional, comentado) Remove questões órfãs LP do banco global
--
-- Proteções — NÃO remove questões que tenham:
--   - user_question_asset_links (texto/tabela/imagem vinculado)
--   - user_question_edits, question_attempts, question_notes ou question_note_entries
--
-- Rode no Supabase → SQL Editor (service role / postgres).
-- PASSO 1: rode o PREVIEW e confira os números.
-- PASSO 2: descomente o bloco DELETE no final e rode de novo.
-- =============================================================================

-- ─── Ajuste aqui ──────────────────────────────────────────────────────────────
-- (1) Cole seu user_id (recomendado). NULL = todos os usuários (evite).
--     SELECT id, email FROM auth.users;
--
-- (2) Confira os nomes das matérias no SELECT "Matérias no escopo" abaixo.

-- =============================================================================
-- PREVIEWww
-- =============================================================================

WITH params AS (
  SELECT
    NULL::uuid AS target_user_id
    -- Exemplo: '00000000-0000-0000-0000-000000000000'::uuid AS target_user_id
),
portuguese_subjects AS (
  SELECT s.id, s.user_id, s.name
  FROM subjects s
  CROSS JOIN params p
  WHERE (
    s.name ILIKE '%portugu%'
    OR s.name ILIKE '%língua portuguesa%'
    OR s.name ILIKE '%lingua portuguesa%'
  )
  AND (p.target_user_id IS NULL OR s.user_id = p.target_user_id)
),
scoped_notebooks AS (
  SELECT n.id, n.user_id, n.name, n.subject_id, n.question_count
  FROM notebooks n
  INNER JOIN portuguese_subjects ps
    ON ps.id = n.subject_id AND ps.user_id = n.user_id
  CROSS JOIN params p
  WHERE (p.target_user_id IS NULL OR n.user_id = p.target_user_id)
    AND n.share_url IS NOT NULL
),
protected_questions AS (
  SELECT DISTINCT qid AS question_id, uid AS user_id
  FROM (
    SELECT l.question_id AS qid, l.user_id AS uid
    FROM user_question_asset_links l
    UNION
    SELECT e.question_id, e.user_id FROM user_question_edits e
    UNION
    SELECT a.question_id, a.user_id FROM question_attempts a
    UNION
    SELECT n.question_id, n.user_id FROM question_notes n
    UNION
    SELECT e.question_id, e.user_id FROM question_note_entries e
  ) x
),
candidates AS (
  SELECT
    nq.id AS notebook_question_id,
    nq.notebook_id,
    nq.question_id,
    nb.user_id,
    nb.name AS notebook_name,
    q.tec_id,
    q.tec_subject,
    LEFT(q.statement, 100) AS statement_preview
  FROM notebook_questions nq
  INNER JOIN scoped_notebooks nb ON nb.id = nq.notebook_id
  INNER JOIN questions q ON q.id = nq.question_id
  LEFT JOIN protected_questions pq
    ON pq.question_id = nq.question_id AND pq.user_id = nb.user_id
  WHERE pq.question_id IS NULL
)
SELECT
  'PREVIEW' AS etapa,
  COUNT(*)::int AS linhas_notebook_questions_a_remover,
  COUNT(DISTINCT notebook_id)::int AS cadernos_afetados,
  COUNT(DISTINCT question_id)::int AS questoes_distintas
FROM candidates;

-- Amostra (até 30)
WITH params AS (
  SELECT NULL::uuid AS target_user_id
),
portuguese_subjects AS (
  SELECT s.id, s.user_id, s.name FROM subjects s
  CROSS JOIN params p
  WHERE (
    s.name ILIKE '%portugu%'
    OR s.name ILIKE '%língua portuguesa%'
    OR s.name ILIKE '%lingua portuguesa%'
  )
  AND (p.target_user_id IS NULL OR s.user_id = p.target_user_id)
),
scoped_notebooks AS (
  SELECT n.id, n.user_id, n.name FROM notebooks n
  INNER JOIN portuguese_subjects ps ON ps.id = n.subject_id AND ps.user_id = n.user_id
  CROSS JOIN params p
  WHERE (p.target_user_id IS NULL OR n.user_id = p.target_user_id)
    AND n.share_url IS NOT NULL
),
protected_questions AS (
  SELECT DISTINCT qid AS question_id, uid AS user_id
  FROM (
    SELECT l.question_id AS qid, l.user_id AS uid FROM user_question_asset_links l
    UNION SELECT e.question_id, e.user_id FROM user_question_edits e
    UNION SELECT a.question_id, a.user_id FROM question_attempts a
    UNION SELECT n.question_id, n.user_id FROM question_notes n
    UNION SELECT e.question_id, e.user_id FROM question_note_entries e
  ) x
),
candidates AS (
  SELECT nq.id, nb.name AS notebook_name, q.tec_id, q.tec_subject,
         LEFT(q.statement, 100) AS statement_preview
  FROM notebook_questions nq
  INNER JOIN scoped_notebooks nb ON nb.id = nq.notebook_id
  INNER JOIN questions q ON q.id = nq.question_id
  LEFT JOIN protected_questions pq
    ON pq.question_id = nq.question_id AND pq.user_id = nb.user_id
  WHERE pq.question_id IS NULL
)
SELECT * FROM candidates ORDER BY notebook_name, tec_id LIMIT 30;

-- Matérias no escopo (confira antes de apagar)
WITH params AS (
  SELECT NULL::uuid AS target_user_id
)
SELECT s.id, s.user_id, s.name
FROM subjects s
CROSS JOIN params p
WHERE (
  s.name ILIKE '%portugu%'
  OR s.name ILIKE '%língua portuguesa%'
  OR s.name ILIKE '%lingua portuguesa%'
)
AND (p.target_user_id IS NULL OR s.user_id = p.target_user_id)
ORDER BY s.name;


-- =============================================================================
-- DELETE — descomente após conferir o PREVIEW
-- (use o MESMO target_user_id do bloco params acima)
-- =============================================================================

/*
BEGIN;

WITH params AS (
  SELECT NULL::uuid AS target_user_id
),
portuguese_subjects AS (
  SELECT s.id, s.user_id, s.name FROM subjects s
  CROSS JOIN params p
  WHERE (
    s.name ILIKE '%portugu%'
    OR s.name ILIKE '%língua portuguesa%'
    OR s.name ILIKE '%lingua portuguesa%'
  )
  AND (p.target_user_id IS NULL OR s.user_id = p.target_user_id)
),
scoped_notebooks AS (
  SELECT n.id, n.user_id FROM notebooks n
  INNER JOIN portuguese_subjects ps ON ps.id = n.subject_id AND ps.user_id = n.user_id
  CROSS JOIN params p
  WHERE (p.target_user_id IS NULL OR n.user_id = p.target_user_id)
    AND n.share_url IS NOT NULL
),
protected_questions AS (
  SELECT DISTINCT qid AS question_id, uid AS user_id
  FROM (
    SELECT l.question_id AS qid, l.user_id AS uid FROM user_question_asset_links l
    UNION SELECT e.question_id, e.user_id FROM user_question_edits e
    UNION SELECT a.question_id, a.user_id FROM question_attempts a
    UNION SELECT n.question_id, n.user_id FROM question_notes n
    UNION SELECT e.question_id, e.user_id FROM question_note_entries e
  ) x
),
candidates AS (
  SELECT nq.id AS notebook_question_id, nq.notebook_id, nq.question_id, nb.user_id
  FROM notebook_questions nq
  INNER JOIN scoped_notebooks nb ON nb.id = nq.notebook_id
  LEFT JOIN protected_questions pq
    ON pq.question_id = nq.question_id AND pq.user_id = nb.user_id
  WHERE pq.question_id IS NULL
),
deleted AS (
  DELETE FROM notebook_questions nq
  USING candidates c
  WHERE nq.id = c.notebook_question_id
  RETURNING nq.notebook_id, nq.question_id
),
affected_notebooks AS (
  SELECT DISTINCT notebook_id FROM deleted
)
UPDATE notebooks n
SET
  question_count = sub.cnt,
  active_question_id = CASE
    WHEN n.active_question_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM deleted d
        WHERE d.notebook_id = n.id AND d.question_id = n.active_question_id
      )
    THEN NULL
    ELSE n.active_question_id
  END,
  updated_at = NOW()
FROM (
  SELECT nb.id AS notebook_id, COUNT(nq.id)::int AS cnt
  FROM notebooks nb
  INNER JOIN affected_notebooks an ON an.notebook_id = nb.id
  LEFT JOIN notebook_questions nq ON nq.notebook_id = nb.id
  GROUP BY nb.id
) sub
WHERE n.id = sub.notebook_id;

COMMIT;

-- Conferência pós-limpeza
WITH params AS (
  SELECT NULL::uuid AS target_user_id
),
portuguese_subjects AS (
  SELECT s.id, s.user_id FROM subjects s
  CROSS JOIN params p
  WHERE (
    s.name ILIKE '%portugu%'
    OR s.name ILIKE '%língua portuguesa%'
    OR s.name ILIKE '%lingua portuguesa%'
  )
  AND (p.target_user_id IS NULL OR s.user_id = p.target_user_id)
)
SELECT
  n.name,
  n.question_count,
  COUNT(nq.id)::int AS questoes_reais,
  COUNT(DISTINCT l.question_id)::int AS com_conteudo_vinculado
FROM notebooks n
INNER JOIN portuguese_subjects ps ON ps.id = n.subject_id AND ps.user_id = n.user_id
LEFT JOIN notebook_questions nq ON nq.notebook_id = n.id
LEFT JOIN user_question_asset_links l
  ON l.question_id = nq.question_id AND l.user_id = n.user_id
WHERE n.share_url IS NOT NULL
GROUP BY n.id, n.name, n.question_count
ORDER BY n.name;
*/

-- =============================================================================
-- OPCIONAL: limpar questões LP órfãs do banco global (sem caderno e sem uso)
-- Rode o PREVIEW abaixo antes; descomente o DELETE só se fizer sentido.
-- =============================================================================

/*
WITH orphan_candidates AS (
  SELECT q.id, q.tec_id, q.tec_subject
  FROM questions q
  WHERE (
    q.tec_subject ILIKE '%portugu%'
    OR q.tec_subject ILIKE '%língua portuguesa%'
    OR q.tec_subject ILIKE '%lingua portuguesa%'
  )
  AND NOT EXISTS (SELECT 1 FROM notebook_questions nq WHERE nq.question_id = q.id)
  AND NOT EXISTS (SELECT 1 FROM user_question_asset_links l WHERE l.question_id = q.id)
  AND NOT EXISTS (SELECT 1 FROM user_question_edits e WHERE e.question_id = q.id)
  AND NOT EXISTS (SELECT 1 FROM question_attempts a WHERE a.question_id = q.id)
  AND NOT EXISTS (SELECT 1 FROM question_notes n WHERE n.question_id = q.id)
  AND NOT EXISTS (SELECT 1 FROM question_note_entries e WHERE e.question_id = q.id)
)
SELECT COUNT(*)::int AS questoes_orfas_lp FROM orphan_candidates;

-- DELETE FROM questions q
-- USING orphan_candidates o
-- WHERE q.id = o.id;
*/
