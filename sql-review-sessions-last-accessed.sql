-- Migration: persistir sessão de revisão mais recente entre dispositivos
-- Execute este SQL no Supabase SQL Editor

ALTER TABLE review_sessions
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

UPDATE review_sessions
SET last_accessed_at = COALESCE(updated_at, created_at, NOW())
WHERE last_accessed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_review_sessions_user_status_last_accessed
ON review_sessions(user_id, status, last_accessed_at DESC);
