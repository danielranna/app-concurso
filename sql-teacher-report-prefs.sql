-- Cota unificada do Professor (relatório + chat Materiais)

ALTER TABLE coach_report_preferences
  ADD COLUMN IF NOT EXISTS max_teacher_queries_per_day INTEGER NOT NULL DEFAULT 30;

-- Alinha legado: quem só tinha max_llm_explanations_per_day passa a ter o mesmo teto
UPDATE coach_report_preferences
SET max_teacher_queries_per_day = GREATEST(
  COALESCE(max_teacher_queries_per_day, 30),
  COALESCE(max_llm_explanations_per_day, 15)
)
WHERE max_teacher_queries_per_day IS NULL OR max_teacher_queries_per_day < max_llm_explanations_per_day;
