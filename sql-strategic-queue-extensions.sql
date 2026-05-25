-- Extensões da fila estratégica (topic_label + prioridade agregada por matéria)
ALTER TABLE strategic_queue_items
  ADD COLUMN IF NOT EXISTS topic_label TEXT;

ALTER TABLE strategic_queue_items
  ADD COLUMN IF NOT EXISTS subject_priority NUMERIC;

CREATE INDEX IF NOT EXISTS idx_strategic_queue_user_subject_priority
  ON strategic_queue_items(user_id, subject_priority DESC NULLS LAST);
