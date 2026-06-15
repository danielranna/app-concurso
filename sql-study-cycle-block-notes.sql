-- Anotação manual em blocos sem assuntos TEC (ex.: discursiva)
-- Execute após sql-study-cycle-blocks.sql

ALTER TABLE study_cycle_content_blocks
  ADD COLUMN IF NOT EXISTS study_note TEXT;
