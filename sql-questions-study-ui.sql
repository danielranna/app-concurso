-- Navegação, cronômetro e retomada de estudo combinado / caderno
-- Rode no Supabase após sql-questions.sql

ALTER TABLE notebooks
  ADD COLUMN IF NOT EXISTS study_elapsed_ms BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_question_id UUID REFERENCES questions(id) ON DELETE SET NULL;

ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS study_elapsed_ms BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_question_id UUID REFERENCES questions(id) ON DELETE SET NULL;
