-- Sincronização de cadernos/respostas com o Papa Vagas (WhatsApp)

CREATE TABLE IF NOT EXISTS quiz_notebook_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  caderno_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'paused', 'finished')),
  delivery_mode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (notebook_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_notebook_sync_caderno ON quiz_notebook_sync(caderno_id);

CREATE TABLE IF NOT EXISTS quiz_notebook_replicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_notebook_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_notebook_replicas_user ON quiz_notebook_replicas(user_id);

CREATE TABLE IF NOT EXISTS quiz_question_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  tec_id BIGINT NOT NULL,
  caderno_id BIGINT NOT NULL,
  caderno_question_id BIGINT,
  published_question_id BIGINT,
  short_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (notebook_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_question_links_tec ON quiz_question_links(tec_id);
CREATE INDEX IF NOT EXISTS idx_quiz_question_links_short ON quiz_question_links(short_id);

ALTER TABLE question_attempts
  ADD COLUMN IF NOT EXISTS attempt_tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE question_note_entries
  ADD COLUMN IF NOT EXISTS sync_origin TEXT
    CHECK (sync_origin IS NULL OR sync_origin IN ('whatsapp'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_question_note_entries_wa_sync
  ON question_note_entries(user_id, question_id)
  WHERE sync_origin = 'whatsapp';

ALTER TABLE quiz_notebook_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_notebook_replicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_question_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_notebook_sync_own" ON quiz_notebook_sync;
CREATE POLICY "quiz_notebook_sync_own" ON quiz_notebook_sync FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = quiz_notebook_sync.notebook_id AND n.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "quiz_notebook_replicas_own" ON quiz_notebook_replicas;
CREATE POLICY "quiz_notebook_replicas_own" ON quiz_notebook_replicas FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "quiz_question_links_own" ON quiz_question_links;
CREATE POLICY "quiz_question_links_own" ON quiz_question_links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM notebooks n
      WHERE n.id = quiz_question_links.notebook_id AND n.user_id = auth.uid()
    )
  );

-- Diagnóstico temporário dos webhooks (dois sentidos)
CREATE TABLE IF NOT EXISTS quiz_sync_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  kind TEXT NOT NULL,
  ok BOOLEAN,
  http_status INT,
  pending BOOLEAN,
  reason TEXT,
  caderno_id BIGINT,
  tec_id BIGINT,
  user_jid TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_sync_event_log_created
  ON quiz_sync_event_log(created_at DESC);

ALTER TABLE quiz_sync_event_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_sync_event_log_read" ON quiz_sync_event_log;
CREATE POLICY "quiz_sync_event_log_read" ON quiz_sync_event_log FOR SELECT
  USING (auth.uid() IS NOT NULL);
