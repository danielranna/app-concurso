-- Linhas normalizadas de incidência (Excel completo por prova)
-- Execute após sql-ai-coaching.sql

CREATE TABLE IF NOT EXISTS incidence_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_target_id UUID NOT NULL REFERENCES exam_targets(id) ON DELETE CASCADE,
  document_id UUID REFERENCES subject_documents(id) ON DELETE SET NULL,
  sheet_name TEXT,
  subject_label TEXT NOT NULL,
  hierarchy_code TEXT NOT NULL DEFAULT '',
  topic_name TEXT NOT NULL,
  is_subtopic BOOLEAN NOT NULL DEFAULT FALSE,
  parent_code TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  percent NUMERIC(8, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidence_rows_exam
  ON incidence_rows(user_id, exam_target_id);

CREATE INDEX IF NOT EXISTS idx_incidence_rows_subject_label
  ON incidence_rows(exam_target_id, subject_label);

CREATE INDEX IF NOT EXISTS idx_incidence_rows_topic
  ON incidence_rows(exam_target_id, topic_name);

-- Estrutura extraída do edital (passo A)
CREATE TABLE IF NOT EXISTS exam_edital_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_target_id UUID NOT NULL REFERENCES exam_targets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  structure JSONB NOT NULL DEFAULT '{}'::jsonb,
  priorities JSONB NOT NULL DEFAULT '{}'::jsonb,
  edital_full_text_length INTEGER,
  model_used TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exam_target_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_edital_analysis_user
  ON exam_edital_analysis(user_id);

-- Service role ignora RLS; habilita se usar cliente autenticado no futuro
ALTER TABLE incidence_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_edital_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incidence_rows_own ON incidence_rows;
CREATE POLICY incidence_rows_own ON incidence_rows
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS exam_edital_analysis_own ON exam_edital_analysis;
CREATE POLICY exam_edital_analysis_own ON exam_edital_analysis
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
