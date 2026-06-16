-- Caderno associado a um bloco de conteúdo do ciclo
-- Execute após sql-study-cycle-block-notes.sql

ALTER TABLE study_cycle_content_blocks
  ADD COLUMN IF NOT EXISTS notebook_id UUID
    REFERENCES notebooks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cycle_content_blocks_notebook
  ON study_cycle_content_blocks(notebook_id)
  WHERE notebook_id IS NOT NULL;
