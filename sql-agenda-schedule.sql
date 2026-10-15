-- Agenda: hora nos eventos + exceção de um dia na rotina
-- Rode no Supabase depois de sql-agenda.sql e sql-agenda-weekly-routine.sql

ALTER TABLE agenda_events
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME;

ALTER TABLE agenda_events DROP CONSTRAINT IF EXISTS agenda_events_time_order;
ALTER TABLE agenda_events
  ADD CONSTRAINT agenda_events_time_order CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR (
      start_time IS NOT NULL
      AND (end_time IS NULL OR end_time > start_time)
    )
  );

CREATE TABLE IF NOT EXISTS agenda_block_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekly_block_id UUID NOT NULL REFERENCES agenda_weekly_blocks(id) ON DELETE CASCADE,
  agenda_date DATE NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('skip', 'reschedule')),
  start_time TIME,
  end_time TIME,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (weekly_block_id, agenda_date),
  CONSTRAINT agenda_block_exceptions_reschedule_times CHECK (
    action <> 'reschedule'
    OR (
      start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND end_time > start_time
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_agenda_block_exceptions_user_date
  ON agenda_block_exceptions (user_id, agenda_date);

ALTER TABLE agenda_block_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_block_exceptions_own ON agenda_block_exceptions;
CREATE POLICY agenda_block_exceptions_own ON agenda_block_exceptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE agenda_weekly_blocks
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#1e293b';
