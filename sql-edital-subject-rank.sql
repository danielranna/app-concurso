-- Ranking normalizado de matérias do edital (por prova alvo)
-- Execute após sql-incidence-rows.sql

CREATE TABLE IF NOT EXISTS exam_edital_subject_rank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_target_id UUID NOT NULL REFERENCES exam_targets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edital_subject_name TEXT NOT NULL,
  priority INTEGER NOT NULL,
  edital_weight TEXT,
  question_count INTEGER,
  percent_of_total NUMERIC(8, 4),
  prova TEXT,
  tiebreaker_note TEXT,
  impact_on_final_score TEXT,
  incidence_summary TEXT,
  why TEXT,
  -- associações futuras (edital × incidência × minhas matérias)
  incidence_subject_label TEXT,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (exam_target_id, edital_subject_name)
);

CREATE INDEX IF NOT EXISTS idx_edital_subject_rank_exam
  ON exam_edital_subject_rank(exam_target_id, priority);

CREATE INDEX IF NOT EXISTS idx_edital_subject_rank_user
  ON exam_edital_subject_rank(user_id);

ALTER TABLE exam_edital_subject_rank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_edital_subject_rank_own ON exam_edital_subject_rank;
CREATE POLICY exam_edital_subject_rank_own ON exam_edital_subject_rank
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
