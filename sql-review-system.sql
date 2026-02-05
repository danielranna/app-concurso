-- SQL para implementar o sistema de revisão
-- Execute este SQL no seu Supabase SQL Editor

-- 1. Adicionar coluna review_count na tabela errors
ALTER TABLE errors
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

-- 2. Criar tabela de sessões de revisão
CREATE TABLE IF NOT EXISTS review_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filters JSONB NOT NULL DEFAULT '{}',
  card_ids UUID[] NOT NULL DEFAULT '{}',
  reviewed_card_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para buscar sessões ativas do usuário rapidamente
CREATE INDEX IF NOT EXISTS idx_review_sessions_user_status 
ON review_sessions(user_id, status);

-- 3. Criar tabela de preferências do usuário
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  history_chart_statuses TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice único para garantir uma preferência por usuário
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_user_id 
ON user_preferences(user_id);

-- 4. Habilitar RLS (Row Level Security) nas novas tabelas
ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de segurança para review_sessions
CREATE POLICY "Users can view own review sessions"
ON review_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own review sessions"
ON review_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own review sessions"
ON review_sessions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own review sessions"
ON review_sessions FOR DELETE
USING (auth.uid() = user_id);

-- 6. Políticas de segurança para user_preferences
CREATE POLICY "Users can view own preferences"
ON user_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
ON user_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
ON user_preferences FOR UPDATE
USING (auth.uid() = user_id);

-- 7. Função para incrementar review_count de um erro
CREATE OR REPLACE FUNCTION increment_review_count(error_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE errors
  SET review_count = COALESCE(review_count, 0) + 1
  WHERE id = error_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Triggers para atualizar updated_at
DROP TRIGGER IF EXISTS update_review_sessions_updated_at ON review_sessions;
CREATE TRIGGER update_review_sessions_updated_at
BEFORE UPDATE ON review_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
BEFORE UPDATE ON user_preferences
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
