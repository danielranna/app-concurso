-- Question bank module (run in Supabase SQL Editor)

-- Global questions (dedupe by tec_id)
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tec_id BIGINT NOT NULL UNIQUE,
  tec_url TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('multiple_choice', 'certo_errado')),
  banca TEXT,
  cargo TEXT,
  orgao TEXT,
  ano INTEGER,
  tec_subject TEXT,
  tec_topic TEXT,
  statement TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_banca ON questions(banca);
CREATE INDEX IF NOT EXISTS idx_questions_ano ON questions(ano);
CREATE INDEX IF NOT EXISTS idx_questions_tec_subject ON questions(tec_subject);
CREATE INDEX IF NOT EXISTS idx_questions_tec_topic ON questions(tec_topic);

CREATE TABLE IF NOT EXISTS question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_question_options_question ON question_options(question_id);

-- User organization
CREATE TABLE IF NOT EXISTS notebook_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES notebook_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notebook_folders_user ON notebook_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_notebook_folders_subject ON notebook_folders(user_id, subject_id);

CREATE TABLE IF NOT EXISTS notebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  folder_id UUID REFERENCES notebook_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  share_url TEXT,
  question_count INTEGER NOT NULL DEFAULT 0,
  answered_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  study_elapsed_ms BIGINT NOT NULL DEFAULT 0,
  active_question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notebooks_user ON notebooks(user_id);
CREATE INDEX IF NOT EXISTS idx_notebooks_subject ON notebooks(user_id, subject_id);

CREATE TABLE IF NOT EXISTS notebook_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(notebook_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_notebook_questions_notebook ON notebook_questions(notebook_id, position);

-- TEC taxonomy mapping per user
CREATE TABLE IF NOT EXISTS tec_taxonomy_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tec_subject TEXT NOT NULL,
  tec_topic TEXT,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tec_subject, tec_topic)
);

CREATE INDEX IF NOT EXISTS idx_tec_mappings_user ON tec_taxonomy_mappings(user_id);

CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  shuffle BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  current_index INTEGER NOT NULL DEFAULT 0,
  queue JSONB NOT NULL DEFAULT '[]'::jsonb,
  answered_tec_ids BIGINT[] NOT NULL DEFAULT '{}',
  study_elapsed_ms BIGINT NOT NULL DEFAULT 0,
  active_question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user ON study_sessions(user_id, status);

CREATE TABLE IF NOT EXISTS study_session_notebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_session_id UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  total INTEGER NOT NULL DEFAULT 0,
  answered INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  UNIQUE(study_session_id, notebook_id)
);

CREATE TABLE IF NOT EXISTS question_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL,
  study_session_id UUID REFERENCES study_sessions(id) ON DELETE SET NULL,
  selected_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_attempts_user_question ON question_attempts(user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_question_attempts_notebook ON question_attempts(notebook_id);

CREATE TABLE IF NOT EXISTS question_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_question_notes_user ON question_notes(user_id);

-- RLS
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE notebook_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notebook_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tec_taxonomy_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_session_notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions_read_all" ON questions FOR SELECT USING (true);
CREATE POLICY "questions_insert_auth" ON questions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "questions_update_auth" ON questions FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "question_options_read_all" ON question_options FOR SELECT USING (true);
CREATE POLICY "question_options_write_auth" ON question_options FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "notebook_folders_own" ON notebook_folders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "notebooks_own" ON notebooks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "notebook_questions_own" ON notebook_questions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = notebook_questions.notebook_id AND n.user_id = auth.uid()
    )
  );
CREATE POLICY "tec_mappings_own" ON tec_taxonomy_mappings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "question_attempts_own" ON question_attempts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "study_sessions_own" ON study_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "study_session_notebooks_own" ON study_session_notebooks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = study_session_notebooks.study_session_id AND s.user_id = auth.uid()
    )
  );
CREATE POLICY "question_notes_own" ON question_notes FOR ALL USING (auth.uid() = user_id);
