-- Blocos de conteúdo do ciclo + planejamento por prazo
-- Execute após sql-content-index.sql

-- Blocos de conteúdo (templates: grupos de assuntos TEC por matéria)
CREATE TABLE IF NOT EXISTS study_cycle_content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES study_cycles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Bloco',
  sort_order INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER NOT NULL DEFAULT 45,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cycle_content_blocks_cycle
  ON study_cycle_content_blocks(cycle_id, subject_id, sort_order);

CREATE TABLE IF NOT EXISTS study_cycle_content_block_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_block_id UUID NOT NULL REFERENCES study_cycle_content_blocks(id) ON DELETE CASCADE,
  tec_subject TEXT NOT NULL,
  tec_topic TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(content_block_id, tec_subject, tec_topic)
);

CREATE INDEX IF NOT EXISTS idx_cycle_content_block_topics_block
  ON study_cycle_content_block_topics(content_block_id, sort_order);

-- Estender ciclo com modo de planejamento
ALTER TABLE study_cycles
  ADD COLUMN IF NOT EXISTS planning_mode TEXT DEFAULT 'time_driven'
    CHECK (planning_mode IN ('time_driven', 'deadline_driven'));

ALTER TABLE study_cycles
  ADD COLUMN IF NOT EXISTS target_weeks INTEGER;

ALTER TABLE study_cycles
  ADD COLUMN IF NOT EXISTS default_block_minutes INTEGER NOT NULL DEFAULT 45;

-- Peso flexível (1–10) em study_cycle_subjects
ALTER TABLE study_cycle_subjects
  DROP CONSTRAINT IF EXISTS study_cycle_subjects_times_in_cycle_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'study_cycle_subjects_times_in_cycle_check'
  ) THEN
    ALTER TABLE study_cycle_subjects
      ADD CONSTRAINT study_cycle_subjects_times_in_cycle_check
      CHECK (times_in_cycle >= 1 AND times_in_cycle <= 10);
  END IF;
END $$;

-- Ligar bloco agendado ao template de conteúdo
ALTER TABLE study_cycle_blocks
  ADD COLUMN IF NOT EXISTS content_block_id UUID
    REFERENCES study_cycle_content_blocks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_study_cycle_blocks_content_block
  ON study_cycle_blocks(content_block_id);
