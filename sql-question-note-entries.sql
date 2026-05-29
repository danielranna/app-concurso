-- Thread de anotações por questão + cache de resposta da IA por entry

CREATE TABLE IF NOT EXISTS question_note_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ai_processed_at TIMESTAMPTZ,
  ai_classify JSONB,
  ai_feedback TEXT,
  ai_audit_zone TEXT CHECK (
    ai_audit_zone IS NULL
    OR ai_audit_zone IN ('red', 'yellow', 'green_note')
  ),
  ai_model_used TEXT
);

CREATE INDEX IF NOT EXISTS idx_question_note_entries_user_question
  ON question_note_entries(user_id, question_id, created_at);

ALTER TABLE question_note_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_note_entries_own" ON question_note_entries;
CREATE POLICY "question_note_entries_own" ON question_note_entries
  FOR ALL USING (auth.uid() = user_id);

-- Migração: uma entry por nota legada não vazia
INSERT INTO question_note_entries (user_id, question_id, body, created_at)
SELECT qn.user_id, qn.question_id, TRIM(qn.note), COALESCE(qn.updated_at, NOW())
FROM question_notes qn
WHERE TRIM(qn.note) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM question_note_entries e
    WHERE e.user_id = qn.user_id AND e.question_id = qn.question_id
  );
