-- SQL para adicionar coluna 'color' na tabela error_statuses
-- Execute este SQL no seu Supabase SQL Editor

ALTER TABLE error_statuses
ADD COLUMN IF NOT EXISTS color TEXT;

-- A coluna color é opcional (pode ser NULL) e armazena o código hexadecimal da cor
-- Exemplo: '#ff0000', '#00ff00', etc.
