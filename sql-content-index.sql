-- Índice de conteúdo (árvore TEC + cadernos) + blocos manuais do ciclos
-- Execute após sql-study-cycle.sql

CREATE TABLE IF NOT EXISTS subject_content_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES subject_content_nodes(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('group', 'topic')),
  name TEXT NOT NULL,
  tec_subject TEXT,
  tec_topic TEXT,
  notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  question_count INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_nodes_user_subject
  ON subject_content_nodes(user_id, subject_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_content_nodes_parent
  ON subject_content_nodes(parent_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_nodes_topic_unique
  ON subject_content_nodes(user_id, subject_id, tec_subject, tec_topic)
  WHERE node_type = 'topic' AND tec_topic IS NOT NULL AND tec_topic <> '';

CREATE TABLE IF NOT EXISTS content_node_banca_incidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES subject_content_nodes(id) ON DELETE CASCADE,
  banca TEXT NOT NULL,
  percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(node_id, banca)
);

CREATE INDEX IF NOT EXISTS idx_content_node_incidence_node
  ON content_node_banca_incidence(node_id);

CREATE TABLE IF NOT EXISTS study_cycle_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES study_cycles(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  content_node_id UUID REFERENCES subject_content_nodes(id) ON DELETE SET NULL,
  block_type TEXT NOT NULL CHECK (block_type IN ('questions', 'flashcards', 'read', 'error_review')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_cycle_blocks_cycle_day
  ON study_cycle_blocks(cycle_id, day_index, sort_order);
