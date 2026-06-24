-- FSRS user settings on flashcard_schedule_settings (run in Supabase SQL Editor)

ALTER TABLE flashcard_schedule_settings
  ADD COLUMN IF NOT EXISTS fsrs_parameters JSONB DEFAULT '{}'::jsonb;
