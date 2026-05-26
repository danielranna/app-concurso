-- Run in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS coach_subject_report_preferences (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  explain_wrong BOOLEAN,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_subject_report_prefs_user
  ON coach_subject_report_preferences(user_id);
