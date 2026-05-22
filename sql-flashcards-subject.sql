-- Vincula baralhos às matérias do app (tabela subjects)
ALTER TABLE flashcard_decks
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_subject ON flashcard_decks(subject_id);
