-- Flashcards module (run in Supabase SQL Editor)
-- Storage: create bucket "flashcard-images" (public) in Dashboard

-- Decks
CREATE TABLE IF NOT EXISTS flashcard_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fsrs_parameters JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user ON flashcard_decks(user_id);

-- Cards (notes)
CREATE TABLE IF NOT EXISTS flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('basic', 'cloze_text', 'cloze_image')),
  front_text TEXT,
  back_text TEXT,
  cloze_text TEXT,
  image_url TEXT,
  image_occluded_url TEXT,
  image_masks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_user ON flashcards(user_id);

-- FSRS state per card
CREATE TABLE IF NOT EXISTS flashcard_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_flashcard_states_due ON flashcard_states(user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_flashcard_states_card ON flashcard_states(card_id);

-- Review history
CREATE TABLE IF NOT EXISTS flashcard_review_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  state_before JSONB,
  state_after JSONB,
  scheduled_days INTEGER,
  reviewed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_review_logs_card ON flashcard_review_logs(card_id);

-- Weekday limits
CREATE TABLE IF NOT EXISTS flashcard_schedule_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday_limits JSONB DEFAULT '{"0":null,"1":null,"2":null,"3":null,"4":null,"5":null,"6":null}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bot settings
CREATE TABLE IF NOT EXISTS flashcard_bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT FALSE,
  phone_e164 TEXT,
  start_hour INTEGER DEFAULT 7 CHECK (start_hour BETWEEN 0 AND 23),
  end_hour INTEGER DEFAULT 19 CHECK (end_hour BETWEEN 0 AND 23),
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bot sessions
CREATE TABLE IF NOT EXISTS flashcard_bot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_confirm'
    CHECK (status IN ('pending_confirm', 'active', 'completed', 'cancelled')),
  card_ids UUID[] NOT NULL DEFAULT '{}',
  confirmed_at TIMESTAMPTZ,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_bot_sessions_user ON flashcard_bot_sessions(user_id, status);

-- Bot dispatch queue
CREATE TABLE IF NOT EXISTS flashcard_bot_dispatch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES flashcard_bot_sessions(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_bot_dispatch_due ON flashcard_bot_dispatch(user_id, scheduled_at)
  WHERE sent_at IS NULL;

-- API keys for bot (store hash only)
CREATE TABLE IF NOT EXISTS flashcard_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  label TEXT DEFAULT 'Bot WhatsApp',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_api_keys_hash ON flashcard_api_keys(key_hash);

-- RLS
ALTER TABLE flashcard_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_review_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_schedule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_bot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_bot_dispatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flashcard_decks_own" ON flashcard_decks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "flashcards_own" ON flashcards FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "flashcard_states_own" ON flashcard_states FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "flashcard_review_logs_own" ON flashcard_review_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "flashcard_schedule_settings_own" ON flashcard_schedule_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "flashcard_bot_settings_own" ON flashcard_bot_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "flashcard_bot_sessions_own" ON flashcard_bot_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "flashcard_bot_dispatch_own" ON flashcard_bot_dispatch FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "flashcard_api_keys_own" ON flashcard_api_keys FOR ALL USING (auth.uid() = user_id);
