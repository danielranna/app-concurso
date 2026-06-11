-- Run in Supabase SQL Editor (se já criou user_shared_assets antes)
ALTER TABLE user_shared_assets ADD COLUMN IF NOT EXISTS fonte TEXT;
