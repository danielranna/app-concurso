-- Rotina semanal: blocos fixos por dia da semana + plano do dia em cada bloco
-- weekday: 1 = segunda … 7 = domingo (ISO)

CREATE TABLE IF NOT EXISTS agenda_weekly_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday >= 1 AND weekday <= 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agenda_weekly_blocks_time_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_agenda_weekly_blocks_user_weekday
  ON agenda_weekly_blocks (user_id, weekday);

CREATE TABLE IF NOT EXISTS agenda_daily_block_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agenda_date DATE NOT NULL,
  weekly_block_id UUID NOT NULL REFERENCES agenda_weekly_blocks(id) ON DELETE CASCADE,
  plan_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, agenda_date, weekly_block_id)
);

CREATE INDEX IF NOT EXISTS idx_agenda_daily_block_plans_user_date
  ON agenda_daily_block_plans (user_id, agenda_date);

ALTER TABLE agenda_weekly_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_daily_block_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY agenda_weekly_blocks_own ON agenda_weekly_blocks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY agenda_daily_block_plans_own ON agenda_daily_block_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
