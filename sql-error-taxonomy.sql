-- Taxonomia pedagógica de erro por tentativa (Coach IA)
-- Execute no Supabase após sql-questions-study-confidence.sql

ALTER TABLE question_attempts
  ADD COLUMN IF NOT EXISTS error_taxonomy TEXT
    CHECK (error_taxonomy IS NULL OR error_taxonomy IN (
      'desatencao',
      'pegadinha_interpretacao',
      'falta_compreensao',
      'calculo_procedimento',
      'falta_memorizacao',
      'nao_aplicavel'
    )),
  ADD COLUMN IF NOT EXISTS error_detail JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_question_attempts_error_taxonomy
  ON question_attempts(user_id, notebook_id)
  WHERE error_taxonomy IS NOT NULL AND is_correct = FALSE;

-- Preferências do relatório por usuário
CREATE TABLE IF NOT EXISTS coach_report_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  explain_wrong BOOLEAN NOT NULL DEFAULT TRUE,
  classify_all_wrong BOOLEAN NOT NULL DEFAULT TRUE,
  max_llm_explanations_per_day INTEGER NOT NULL DEFAULT 15,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
