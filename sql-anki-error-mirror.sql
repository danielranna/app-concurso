-- Espelho erro (app) ↔ nota do Anki.
-- Rode no Supabase antes de usar a exclusão dos dois lados.

ALTER TABLE errors
  ADD COLUMN IF NOT EXISTS anki_note_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_errors_user_anki_note
  ON errors(user_id, anki_note_id)
  WHERE anki_note_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS anki_note_tombstones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  anki_note_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, anki_note_id)
);

CREATE INDEX IF NOT EXISTS idx_anki_tombstones_user
  ON anki_note_tombstones(user_id, created_at);
