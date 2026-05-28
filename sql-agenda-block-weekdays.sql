-- Blocos com vários dias da semana (em vez de 1 bloco por dia)
-- Rode após sql-agenda-weekly-routine.sql

CREATE TABLE IF NOT EXISTS agenda_weekly_block_days (
  block_id UUID NOT NULL REFERENCES agenda_weekly_blocks(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday >= 1 AND weekday <= 7),
  PRIMARY KEY (block_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_agenda_weekly_block_days_weekday
  ON agenda_weekly_block_days (weekday);

-- Migrar coluna weekday antiga (se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agenda_weekly_blocks' AND column_name = 'weekday'
  ) THEN
    INSERT INTO agenda_weekly_block_days (block_id, weekday)
    SELECT id, weekday FROM agenda_weekly_blocks
  WHERE weekday IS NOT NULL
    ON CONFLICT DO NOTHING;

    ALTER TABLE agenda_weekly_blocks DROP COLUMN weekday;
  END IF;
END $$;

ALTER TABLE agenda_weekly_block_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY agenda_weekly_block_days_own ON agenda_weekly_block_days
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agenda_weekly_blocks b
      WHERE b.id = block_id AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agenda_weekly_blocks b
      WHERE b.id = block_id AND b.user_id = auth.uid()
    )
  );
