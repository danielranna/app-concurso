-- Peso do edital na fila estratégica (execute após sql-coach-jobs-brain-queue.sql)
ALTER TABLE strategic_queue_items
  ADD COLUMN IF NOT EXISTS edital_weight NUMERIC NOT NULL DEFAULT 1;
