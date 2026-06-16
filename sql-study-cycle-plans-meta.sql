-- Metadados para biblioteca de planos e fases da consultoria
-- Execute após sql-study-cycle-content-block-notebook.sql

ALTER TABLE study_cycles
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE study_cycle_content_blocks
  ADD COLUMN IF NOT EXISTS phase_label TEXT;
