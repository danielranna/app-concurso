-- ============================================
-- SISTEMA DE ANÁLISE DE EFICIÊNCIA
-- Execute este SQL no Supabase SQL Editor
-- ============================================

-- 1. Adicionar campos de intervenção na tabela errors
ALTER TABLE errors
ADD COLUMN IF NOT EXISTS needs_intervention BOOLEAN DEFAULT FALSE;

ALTER TABLE errors
ADD COLUMN IF NOT EXISTS intervention_flagged_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE errors
ADD COLUMN IF NOT EXISTS intervention_resolved_at TIMESTAMP WITH TIME ZONE;

-- 2. Índice para buscar cards que precisam de intervenção
CREATE INDEX IF NOT EXISTS idx_errors_needs_intervention 
ON errors(user_id, needs_intervention) WHERE needs_intervention = TRUE;

-- 3. Adicionar configurações de análise em user_preferences
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS analysis_config JSONB DEFAULT '{
  "status_weights": {},
  "review_threshold": 30,
  "efficiency_threshold": 0.1,
  "auto_flag_enabled": true
}'::jsonb;

-- 4. Função para calcular eficiência de um card
CREATE OR REPLACE FUNCTION calculate_card_efficiency(
  p_status_weight INTEGER,
  p_review_count INTEGER
)
RETURNS NUMERIC AS $$
BEGIN
  IF p_review_count = 0 OR p_review_count IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN ROUND(p_status_weight::NUMERIC / p_review_count::NUMERIC, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. Função para aplicar flag de intervenção
CREATE OR REPLACE FUNCTION set_intervention_flag(
  p_error_id UUID,
  p_needs_intervention BOOLEAN
)
RETURNS void AS $$
BEGIN
  UPDATE errors
  SET 
    needs_intervention = p_needs_intervention,
    intervention_flagged_at = CASE 
      WHEN p_needs_intervention = TRUE AND needs_intervention = FALSE THEN NOW()
      ELSE intervention_flagged_at
    END,
    intervention_resolved_at = CASE 
      WHEN p_needs_intervention = FALSE AND needs_intervention = TRUE THEN NOW()
      ELSE intervention_resolved_at
    END
  WHERE id = p_error_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
