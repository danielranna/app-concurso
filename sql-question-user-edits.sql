-- Run in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS user_question_edits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('multiple_choice', 'certo_errado')),
  statement TEXT,
  content_before TEXT,
  content_after TEXT,
  correct_answer TEXT,
  options JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_user_question_edits_user ON user_question_edits(user_id);
