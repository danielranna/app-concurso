-- Metacognição por tentativa (confiança + categoria de resultado)
-- Rode no Supabase após sql-questions.sql

ALTER TABLE question_attempts
  ADD COLUMN IF NOT EXISTS confidence_level TEXT NOT NULL DEFAULT 'seguro'
    CHECK (confidence_level IN ('seguro', 'inseguro', 'chute')),
  ADD COLUMN IF NOT EXISTS outcome_category TEXT NOT NULL DEFAULT 'conhecimento_solido'
    CHECK (outcome_category IN (
      'conhecimento_solido',
      'conhecimento_fragil',
      'lacuna_critica',
      'lacuna_consciente',
      'falso_positivo',
      'conteudo_desconhecido'
    ));
