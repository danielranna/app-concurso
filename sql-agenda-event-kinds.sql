-- Tipos de evento (ex.: Novo edital) e os valores de cada ficha.
-- Rode no Supabase depois dos scripts da agenda.

CREATE TABLE IF NOT EXISTS agenda_event_kinds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agenda_event_kinds_user
  ON agenda_event_kinds (user_id);

CREATE TABLE IF NOT EXISTS agenda_event_kind_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind_id UUID NOT NULL REFERENCES agenda_event_kinds(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'date', 'money', 'number')),
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agenda_event_kind_fields_date_color CHECK (
    field_type <> 'date' OR color IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_agenda_event_kind_fields_kind
  ON agenda_event_kind_fields (kind_id, sort_order);

ALTER TABLE agenda_events
  ADD COLUMN IF NOT EXISTS kind_id UUID REFERENCES agenda_event_kinds(id) ON DELETE CASCADE;

ALTER TABLE agenda_events
  ALTER COLUMN event_date DROP NOT NULL;

ALTER TABLE agenda_events DROP CONSTRAINT IF EXISTS agenda_events_end_after_start;
ALTER TABLE agenda_events
  ADD CONSTRAINT agenda_events_end_after_start CHECK (
    end_date IS NULL OR (event_date IS NOT NULL AND end_date >= event_date)
  );

ALTER TABLE agenda_events DROP CONSTRAINT IF EXISTS agenda_events_pontual_has_date;
ALTER TABLE agenda_events
  ADD CONSTRAINT agenda_events_pontual_has_date CHECK (
    kind_id IS NOT NULL OR event_date IS NOT NULL
  );

CREATE TABLE IF NOT EXISTS agenda_event_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES agenda_events(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES agenda_event_kind_fields(id) ON DELETE CASCADE,
  value_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_agenda_event_values_event
  ON agenda_event_values (event_id);

CREATE INDEX IF NOT EXISTS idx_agenda_event_values_field_value
  ON agenda_event_values (field_id, value_text);

ALTER TABLE agenda_event_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_event_kind_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_event_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_event_kinds_own ON agenda_event_kinds;
CREATE POLICY agenda_event_kinds_own ON agenda_event_kinds
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS agenda_event_kind_fields_own ON agenda_event_kind_fields;
CREATE POLICY agenda_event_kind_fields_own ON agenda_event_kind_fields
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agenda_event_kinds k
      WHERE k.id = kind_id AND k.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agenda_event_kinds k
      WHERE k.id = kind_id AND k.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agenda_event_values_own ON agenda_event_values;
CREATE POLICY agenda_event_values_own ON agenda_event_values
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agenda_events e
      WHERE e.id = event_id AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agenda_events e
      WHERE e.id = event_id AND e.user_id = auth.uid()
    )
  );
