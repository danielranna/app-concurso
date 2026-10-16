-- Associação baralho do Anki → matéria do app.
-- Rode no Supabase. A extensão envia os nomes dos baralhos.

CREATE TABLE IF NOT EXISTS anki_deck_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  deck_name TEXT NOT NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, deck_name)
);

CREATE INDEX IF NOT EXISTS idx_anki_deck_links_user
  ON anki_deck_links(user_id);
