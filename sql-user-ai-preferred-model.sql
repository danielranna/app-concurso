-- Preferência de modelo de texto por usuário (BYOK)
-- Execute no Supabase SQL Editor após sql-user-ai-credentials.sql

ALTER TABLE user_ai_credentials
  ADD COLUMN IF NOT EXISTS preferred_model TEXT;

COMMENT ON COLUMN user_ai_credentials.preferred_model IS
  'Modelo de chat escolhido pelo usuário (allowlist no app). NULL = default do provedor.';
