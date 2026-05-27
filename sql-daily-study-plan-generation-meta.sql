-- Snapshot de como o plano foi montado (UI transparência)
ALTER TABLE daily_study_plans
  ADD COLUMN IF NOT EXISTS generation_meta JSONB;
