-- Explicação do cálculo da % por matéria (ranking objetivo)
ALTER TABLE exam_edital_subject_rank
  ADD COLUMN IF NOT EXISTS percent_calculation TEXT;
