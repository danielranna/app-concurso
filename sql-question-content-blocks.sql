-- Blocos de conteúdo (texto/imagem) acima e abaixo do enunciado — correções por usuário
-- Execute no Supabase SQL Editor após sql-question-user-edits.sql

ALTER TABLE user_question_edits
  ADD COLUMN IF NOT EXISTS content_blocks JSONB;
