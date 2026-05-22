-- Uma matéria = um baralho (tabela subjects)
ALTER TABLE flashcard_decks
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_subject ON flashcard_decks(subject_id);

-- No máximo um baralho por matéria por usuário
CREATE UNIQUE INDEX IF NOT EXISTS idx_flashcard_decks_user_subject
  ON flashcard_decks(user_id, subject_id)
  WHERE subject_id IS NOT NULL;
