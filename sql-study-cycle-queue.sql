-- Fila de execução do ciclo (concluir / adiar sessões)
-- Execute no SQL Editor do Supabase após sql-content-index.sql

ALTER TABLE study_cycle_blocks
  ADD COLUMN IF NOT EXISTS queue_position INTEGER;

ALTER TABLE study_cycle_blocks
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE study_cycle_blocks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'study_cycle_blocks_status_check'
  ) THEN
    ALTER TABLE study_cycle_blocks
      ADD CONSTRAINT study_cycle_blocks_status_check
      CHECK (status IN ('pending', 'completed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_study_cycle_blocks_queue
  ON study_cycle_blocks(cycle_id, queue_position);
