-- Run in Supabase SQL Editor
-- Biblioteca pessoal de textos/tabelas/imagens compartilhados entre questões

CREATE TABLE IF NOT EXISTS user_shared_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'image')),
  title TEXT,
  fonte TEXT,
  label TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  width_pct INTEGER CHECK (width_pct IS NULL OR (width_pct >= 15 AND width_pct <= 100)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_shared_assets_user ON user_shared_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_shared_assets_user_kind ON user_shared_assets(user_id, kind);

CREATE TABLE IF NOT EXISTS user_question_asset_links (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES user_shared_assets(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  content_override TEXT,
  PRIMARY KEY (user_id, question_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_user_question_asset_links_question
  ON user_question_asset_links(user_id, question_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_user_question_asset_links_asset
  ON user_question_asset_links(asset_id);

ALTER TABLE user_shared_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_question_asset_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_shared_assets_own" ON user_shared_assets
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "user_question_asset_links_own" ON user_question_asset_links
  FOR ALL USING (auth.uid() = user_id);
