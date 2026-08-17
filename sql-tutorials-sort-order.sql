-- Run in Supabase SQL Editor (tabela tutorials já existe)
-- Ordem de apresentação dos tutoriais na listagem

ALTER TABLE tutorials
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tutorials_status_sort
  ON tutorials (status, sort_order, created_at);

WITH numbered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1) AS next_order
  FROM tutorials
)
UPDATE tutorials t
SET sort_order = n.next_order
FROM numbered n
WHERE t.id = n.id;
