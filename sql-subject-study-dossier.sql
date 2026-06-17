-- Caderno da Matéria (relato do cérebro por matéria)
-- Execute após sql-coach-jobs-brain-queue.sql

CREATE TABLE IF NOT EXISTS subject_study_dossier (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  narrative_md TEXT,
  structured JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_report_ids UUID[] NOT NULL DEFAULT '{}',
  input_snapshot JSONB,
  model_used TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd_estimate NUMERIC(12, 6) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_study_dossier_updated
  ON subject_study_dossier(user_id, updated_at DESC);
