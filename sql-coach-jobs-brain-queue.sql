-- Jobs, Cérebro, Fila estratégica e Plano do dia (Coach IA)
-- Execute após sql-ai-coaching.sql e sql-error-taxonomy.sql

CREATE TABLE IF NOT EXISTS ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_message TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_pending
  ON ai_jobs(status, scheduled_at)
  WHERE status IN ('pending', 'running');

CREATE TABLE IF NOT EXISTS subject_brain_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_md TEXT,
  last_report_id UUID REFERENCES subject_notebook_reports(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, subject_id)
);

CREATE TABLE IF NOT EXISTS strategic_queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_key TEXT NOT NULL,
  priority_score NUMERIC NOT NULL DEFAULT 0,
  incidence_weight NUMERIC NOT NULL DEFAULT 1,
  gap_score NUMERIC NOT NULL DEFAULT 0.5,
  retention_penalty NUMERIC NOT NULL DEFAULT 1,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'sql' CHECK (source IN ('sql', 'llm')),
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, subject_id, topic_key)
);

CREATE INDEX IF NOT EXISTS idx_strategic_queue_user_score
  ON strategic_queue_items(user_id, priority_score DESC);

CREATE TABLE IF NOT EXISTS daily_study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  mode TEXT NOT NULL DEFAULT 'pre_edital'
    CHECK (mode IN ('pre_edital', 'pos_edital', 'reta_final')),
  limits JSONB NOT NULL DEFAULT '{"questions":50,"flashcards":20,"summaries":2}'::jsonb,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  rotation_note TEXT,
  narrative_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, plan_date)
);

CREATE TABLE IF NOT EXISTS coach_study_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  study_mode TEXT NOT NULL DEFAULT 'pre_edital'
    CHECK (study_mode IN ('pre_edital', 'pos_edital', 'reta_final')),
  daily_limits JSONB NOT NULL DEFAULT '{"questions":50,"flashcards":20,"summaries":2,"error_reviews":10}'::jsonb,
  rotate_subjects BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Busca lexical MVP em chunks (sem pgvector)
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_document_chunks_search
  ON document_chunks USING GIN (search_vector);
