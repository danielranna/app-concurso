-- Categorias de erro (FCC, Simulado Cespe, custom) + filtro ativo
-- Execute no Supabase SQL Editor

CREATE TABLE IF NOT EXISTS error_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  is_default_auto BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_error_categories_user
  ON error_categories(user_id);

ALTER TABLE errors
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES error_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_errors_category
  ON errors(user_id, category_id)
  WHERE category_id IS NOT NULL;

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS active_error_category_id UUID
    REFERENCES error_categories(id) ON DELETE SET NULL;

ALTER TABLE error_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own error_categories'
  ) THEN
    CREATE POLICY "Users can view own error_categories"
      ON error_categories FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own error_categories'
  ) THEN
    CREATE POLICY "Users can insert own error_categories"
      ON error_categories FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own error_categories'
  ) THEN
    CREATE POLICY "Users can update own error_categories"
      ON error_categories FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own error_categories'
  ) THEN
    CREATE POLICY "Users can delete own error_categories"
      ON error_categories FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Seed FCC + Simulado Cespe para usuários que já têm erros
INSERT INTO error_categories (user_id, name, is_default_auto)
SELECT DISTINCT e.user_id, 'FCC', FALSE
FROM errors e
WHERE NOT EXISTS (
  SELECT 1 FROM error_categories c
  WHERE c.user_id = e.user_id AND c.name = 'FCC'
);

INSERT INTO error_categories (user_id, name, is_default_auto)
SELECT DISTINCT e.user_id, 'Simulado Cespe', TRUE
FROM errors e
WHERE NOT EXISTS (
  SELECT 1 FROM error_categories c
  WHERE c.user_id = e.user_id AND c.name = 'Simulado Cespe'
);

-- Erros legados (sem source_question_id) → FCC
UPDATE errors e
SET category_id = c.id
FROM error_categories c
WHERE c.user_id = e.user_id
  AND c.name = 'FCC'
  AND e.category_id IS NULL
  AND e.source_question_id IS NULL;

-- Erros automáticos já existentes → Simulado Cespe
UPDATE errors e
SET category_id = c.id
FROM error_categories c
WHERE c.user_id = e.user_id
  AND c.name = 'Simulado Cespe'
  AND e.category_id IS NULL
  AND e.source_question_id IS NOT NULL;

-- Qualquer residual sem categoria → FCC
UPDATE errors e
SET category_id = c.id
FROM error_categories c
WHERE c.user_id = e.user_id
  AND c.name = 'FCC'
  AND e.category_id IS NULL;
