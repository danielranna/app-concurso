-- Coach IA: relatórios, edital, fila de ações, sinais de aprendizado
-- Execute no Supabase SQL Editor após sql-questions.sql

ALTER TABLE notebooks
  ADD COLUMN IF NOT EXISTS report_pending BOOLEAN NOT NULL DEFAULT FALSE;

-- Prova / concurso alvo
CREATE TABLE IF NOT EXISTS exam_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  banca TEXT,
  orgao TEXT,
  cargo TEXT,
  year INTEGER,
  edital_document_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_targets_user ON exam_targets(user_id);

-- Relatório de planejamento por prova
CREATE TABLE IF NOT EXISTS exam_target_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_target_id UUID NOT NULL REFERENCES exam_targets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_md TEXT,
  structured JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_snapshot JSONB,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PDFs: edital, incidência, material
CREATE TABLE IF NOT EXISTS subject_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  exam_target_id UUID REFERENCES exam_targets(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('edital', 'incidence', 'study_material')),
  file_path TEXT,
  title TEXT NOT NULL,
  parsed_tables JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subject_documents_user ON subject_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_subject_documents_subject ON subject_documents(user_id, subject_id);

-- Fila de ações (aprovação 1 a 1)
CREATE TABLE IF NOT EXISTS ai_action_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  exam_target_id UUID REFERENCES exam_targets(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  source_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_action_drafts_user_status
  ON ai_action_drafts(user_id, status, created_at DESC);

-- Relatório por caderno concluído
CREATE TABLE IF NOT EXISTS subject_notebook_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  summary_md TEXT,
  structured JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_snapshot JSONB,
  model_used TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd_estimate NUMERIC(10, 6),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(notebook_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_notebook_reports_user
  ON subject_notebook_reports(user_id, created_at DESC);

-- Meta-relatório da matéria
CREATE TABLE IF NOT EXISTS subject_strategy_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  report_ids UUID[] NOT NULL DEFAULT '{}',
  summary_md TEXT,
  structured JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sinais pré-computados
CREATE TABLE IF NOT EXISTS learning_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, subject_id, signal_type, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_learning_signals_user_subject
  ON learning_signals(user_id, subject_id, score DESC);

-- Auditoria de custo IA
CREATE TABLE IF NOT EXISTS ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_estimate NUMERIC(10, 6),
  status TEXT NOT NULL DEFAULT 'ok',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RAG (fase posterior)
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES subject_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
