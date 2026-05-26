-- Run in Supabase SQL Editor
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS library_saved BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_notebooks_library_saved ON notebooks(user_id, library_saved);
