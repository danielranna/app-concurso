-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS pdf_text_correction_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL,
  replacement TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'both' CHECK (scope IN ('statement', 'option', 'both')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdf_text_acronyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acronym TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_text_correction_rules_priority
  ON pdf_text_correction_rules (priority);

CREATE INDEX IF NOT EXISTS idx_pdf_text_acronyms_priority
  ON pdf_text_acronyms (priority);

INSERT INTO pdf_text_correction_rules (pattern, replacement, scope, enabled, priority)
VALUES
  ('alemde', 'além de', 'both', TRUE, 10),
  ('P ode', 'Pode', 'both', TRUE, 20)
ON CONFLICT DO NOTHING;

INSERT INTO pdf_text_acronyms (acronym, enabled, priority)
VALUES
  ('IBS', TRUE, 10),
  ('CBS', TRUE, 20)
ON CONFLICT (acronym) DO NOTHING;
