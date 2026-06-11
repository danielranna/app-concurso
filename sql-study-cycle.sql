-- Ciclo de estudo (pré-edital) + fila dual (brain vs crossed)
-- Execute após sql-coach-jobs-brain-queue.sql

-- Fila dual: pré-edital usa brain, pós-edital usa crossed
ALTER TABLE strategic_queue_items
  ADD COLUMN IF NOT EXISTS priority_source text NOT NULL DEFAULT 'crossed';

-- Migra filas existentes para crossed
UPDATE strategic_queue_items SET priority_source = 'crossed' WHERE priority_source IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'strategic_queue_items_priority_source_check'
  ) THEN
    ALTER TABLE strategic_queue_items
      ADD CONSTRAINT strategic_queue_items_priority_source_check
      CHECK (priority_source IN ('crossed', 'brain'));
  END IF;
END $$;

-- Troca unique para permitir mesmo tópico em filas diferentes
ALTER TABLE strategic_queue_items
  DROP CONSTRAINT IF EXISTS strategic_queue_items_user_id_subject_id_topic_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_strategic_queue_user_subject_topic_source
  ON strategic_queue_items(user_id, subject_id, topic_key, priority_source);

CREATE INDEX IF NOT EXISTS idx_strategic_queue_user_source_score
  ON strategic_queue_items(user_id, priority_source, priority_score DESC);

-- Preferências de ciclo
ALTER TABLE coach_study_preferences
  ADD COLUMN IF NOT EXISTS cycle_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE coach_study_preferences
  ADD COLUMN IF NOT EXISTS cycle_paused_at timestamptz;

ALTER TABLE coach_study_preferences
  ADD COLUMN IF NOT EXISTS subjects_per_cycle_day integer NOT NULL DEFAULT 2;

-- Ciclo de estudo
CREATE TABLE IF NOT EXISTS study_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  name TEXT NOT NULL DEFAULT 'Meu ciclo',
  subjects_per_day INTEGER NOT NULL DEFAULT 2,
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  current_day_index INTEGER NOT NULL DEFAULT 0,
  total_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_cycles_user_status
  ON study_cycles(user_id, status);

CREATE TABLE IF NOT EXISTS study_cycle_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES study_cycles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  times_in_cycle INTEGER NOT NULL DEFAULT 1 CHECK (times_in_cycle IN (1, 2)),
  UNIQUE(cycle_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_study_cycle_subjects_cycle
  ON study_cycle_subjects(cycle_id, sort_order);

CREATE TABLE IF NOT EXISTS study_cycle_weekday_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES study_cycles(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  minutes INTEGER NOT NULL DEFAULT 120,
  daily_limits JSONB NOT NULL DEFAULT '{"questions":50,"flashcards":20,"summaries":2,"error_reviews":10}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(cycle_id, weekday)
);

CREATE TABLE IF NOT EXISTS study_cycle_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES study_cycles(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  weekday INTEGER CHECK (weekday >= 0 AND weekday <= 6),
  subject_ids UUID[] NOT NULL DEFAULT '{}',
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  plan_date DATE,
  UNIQUE(cycle_id, day_index)
);

CREATE INDEX IF NOT EXISTS idx_study_cycle_days_cycle
  ON study_cycle_days(cycle_id, day_index);
