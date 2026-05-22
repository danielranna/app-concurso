-- Chave de IA por usuário (BYOK): cada um usa a própria conta OpenAI/Anthropic
-- Execute no Supabase SQL Editor após sql-ai-coaching.sql

CREATE TABLE IF NOT EXISTS user_ai_credentials (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'openai'
    CHECK (provider IN ('openai', 'anthropic')),
  encrypted_key TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_ai_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_ai_credentials_select_own"
  ON user_ai_credentials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_ai_credentials_insert_own"
  ON user_ai_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_ai_credentials_update_own"
  ON user_ai_credentials FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "user_ai_credentials_delete_own"
  ON user_ai_credentials FOR DELETE
  USING (auth.uid() = user_id);
