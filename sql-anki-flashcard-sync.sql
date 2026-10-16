-- Cards sincronizados com o Anki usam a repetição do Anki.
-- Rode no Supabase junto com sql-anki-error-mirror.sql.

ALTER TABLE flashcards
  ADD COLUMN IF NOT EXISTS anki_note_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_flashcards_user_anki_note
  ON flashcards(user_id, anki_note_id)
  WHERE anki_note_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS anki_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  anki_note_id BIGINT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, flashcard_id)
);

CREATE INDEX IF NOT EXISTS idx_anki_review_queue_user
  ON anki_review_queue(user_id, created_at);
