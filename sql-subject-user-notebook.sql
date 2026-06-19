-- Caderno editável pelo usuário (página canvas por matéria)
CREATE TABLE IF NOT EXISTS subject_user_notebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  document JSONB NOT NULL DEFAULT '{"version":2,"blocks":[{"type":"paragraph"}]}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_user_notebooks_user
  ON subject_user_notebooks (user_id);

-- Caderno de erros IA (canvas incremental por matéria)
CREATE TABLE IF NOT EXISTS subject_ai_error_notebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  document JSONB NOT NULL DEFAULT '{"version":2,"blocks":[{"type":"paragraph"}]}'::jsonb,
  source_report_ids UUID[] NOT NULL DEFAULT '{}',
  last_report_id UUID,
  model_used TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_ai_error_notebooks_user
  ON subject_ai_error_notebooks (user_id);
