-- Árvore TEC organizável (pré-mapeamento) por matéria TEC
-- Execute após sql-questions.sql

CREATE TABLE IF NOT EXISTS tec_subject_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tec_subject TEXT NOT NULL,
  parent_id UUID REFERENCES tec_subject_nodes(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL CHECK (node_type IN ('folder', 'topic')),
  name TEXT NOT NULL,
  tec_topic TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  question_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tec_subject_nodes_user_subject
  ON tec_subject_nodes(user_id, tec_subject, sort_order);

CREATE INDEX IF NOT EXISTS idx_tec_subject_nodes_parent
  ON tec_subject_nodes(parent_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tec_subject_nodes_topic_unique
  ON tec_subject_nodes(user_id, tec_subject, tec_topic)
  WHERE node_type = 'topic' AND tec_topic IS NOT NULL AND tec_topic <> '';

ALTER TABLE tec_subject_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tec_subject_nodes_own" ON tec_subject_nodes
  FOR ALL USING (auth.uid() = user_id);
