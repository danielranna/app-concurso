-- Limite de blocos por dia da semana no ciclo de estudos
-- Execute no SQL Editor do Supabase se salvar Configurações retornar PGRST204

ALTER TABLE study_cycle_weekday_limits
  ADD COLUMN IF NOT EXISTS max_blocks INTEGER;
