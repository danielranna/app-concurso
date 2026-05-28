-- Agenda pessoal: blocos diários (horário) e eventos (prazos, lembretes)

CREATE TABLE IF NOT EXISTS agenda_daily_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agenda_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agenda_daily_blocks_time_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_agenda_daily_blocks_user_date
  ON agenda_daily_blocks (user_id, agenda_date);

CREATE TABLE IF NOT EXISTS agenda_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  end_date DATE,
  notes TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agenda_events_end_after_start CHECK (
    end_date IS NULL OR end_date >= event_date
  )
);

CREATE INDEX IF NOT EXISTS idx_agenda_events_user_date
  ON agenda_events (user_id, event_date);

ALTER TABLE agenda_daily_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY agenda_daily_blocks_own ON agenda_daily_blocks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY agenda_events_own ON agenda_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
