-- Simulado de erros v1: caderno permanente + 1 card FSRS por conhecimento
-- Execute no Supabase SQL Editor

-- 1) Colunas no caderno de erros
ALTER TABLE errors
  ADD COLUMN IF NOT EXISTS source_question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_attempt_id UUID REFERENCES question_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_answer TEXT,
  ADD COLUMN IF NOT EXISTS correct_answer TEXT,
  ADD COLUMN IF NOT EXISTS explanation TEXT,
  ADD COLUMN IF NOT EXISTS motivo TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS learning_status TEXT NOT NULL DEFAULT 'novo_erro'
    CHECK (learning_status IN ('novo_erro', 'em_revisao', 'consolidado')),
  ADD COLUMN IF NOT EXISTS active_flashcard_id UUID,
  ADD COLUMN IF NOT EXISTS knowledge_summary TEXT,
  ADD COLUMN IF NOT EXISTS knowledge_key TEXT,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;

-- 2) Vínculo bidirecional no flashcard
ALTER TABLE flashcards
  ADD COLUMN IF NOT EXISTS source_error_id UUID REFERENCES errors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_flashcards_source_error
  ON flashcards(source_error_id)
  WHERE source_error_id IS NOT NULL;

-- FK errors.active_flashcard_id → flashcards (adicionada após a coluna existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'errors_active_flashcard_id_fkey'
  ) THEN
    ALTER TABLE errors
      ADD CONSTRAINT errors_active_flashcard_id_fkey
      FOREIGN KEY (active_flashcard_id) REFERENCES flashcards(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Dedupe: mesma questão-origem → um registro de erro por usuário
CREATE UNIQUE INDEX IF NOT EXISTS idx_errors_user_source_question
  ON errors(user_id, source_question_id)
  WHERE source_question_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_errors_user_knowledge_key
  ON errors(user_id, knowledge_key)
  WHERE knowledge_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_errors_active_flashcard
  ON errors(active_flashcard_id)
  WHERE active_flashcard_id IS NOT NULL;
