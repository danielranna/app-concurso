-- Executor: matérias do plano + distribuição de questões
-- Execute após sql-coach-jobs-brain-queue.sql

ALTER TABLE coach_study_preferences
  ADD COLUMN IF NOT EXISTS executor_subject_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS question_distribution_mode TEXT NOT NULL DEFAULT 'fixed_per_subject',
  ADD COLUMN IF NOT EXISTS questions_per_subject_round INT NOT NULL DEFAULT 5;

ALTER TABLE coach_study_preferences
  DROP CONSTRAINT IF EXISTS coach_study_preferences_question_distribution_mode_check;

ALTER TABLE coach_study_preferences
  ADD CONSTRAINT coach_study_preferences_question_distribution_mode_check
  CHECK (question_distribution_mode IN ('fixed_per_subject', 'equal_split'));

ALTER TABLE daily_study_plans
  ADD COLUMN IF NOT EXISTS generation_meta JSONB;
