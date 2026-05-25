-- Vários vínculos por linha do edital (ex.: 3 matérias num único item do edital)
-- Execute após sql-edital-subject-rank.sql

ALTER TABLE exam_edital_subject_rank
  ADD COLUMN IF NOT EXISTS incidence_subject_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS subject_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE exam_edital_subject_rank
SET incidence_subject_labels = jsonb_build_array(incidence_subject_label)
WHERE incidence_subject_label IS NOT NULL
  AND incidence_subject_label <> ''
  AND (incidence_subject_labels IS NULL OR incidence_subject_labels = '[]'::jsonb);

UPDATE exam_edital_subject_rank
SET subject_ids = jsonb_build_array(subject_id::text)
WHERE subject_id IS NOT NULL
  AND (subject_ids IS NULL OR subject_ids = '[]'::jsonb);
