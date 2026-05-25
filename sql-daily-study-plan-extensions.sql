-- Extensões do plano do dia (execution): pin, caderno dedicado, conclusão de blocos
-- Execute após sql-coach-jobs-brain-queue.sql

ALTER TABLE daily_study_plans
  ADD COLUMN IF NOT EXISTS user_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS combined_notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS plan_block_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES daily_study_plans(id) ON DELETE CASCADE,
  block_key TEXT NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plan_id, block_key)
);

CREATE INDEX IF NOT EXISTS idx_plan_block_completions_user
  ON plan_block_completions(user_id, completed_at DESC);
