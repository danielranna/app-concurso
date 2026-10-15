-- Opt-in: a IA só comenta a anotação se o aluno pediu.
-- Rode no SQL Editor do Supabase (app de estudo).

ALTER TABLE question_note_entries
  ADD COLUMN IF NOT EXISTS ai_requested boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN question_note_entries.ai_requested IS
  'Se true, o pipeline de esclarecimento da IA roda nesta anotação; padrão false (opt-in).';
