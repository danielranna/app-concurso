-- =============================================================================
-- RESET TOTAL — módulo de questões (começar do zero após parser corrigido)
-- =============================================================================
-- Apaga TUDO abaixo: banco global, alternativas, cadernos, pastas, vínculos TEC,
-- tentativas, notas rápidas e sessões de estudo combinado.
--
-- NÃO apaga: subjects, topics, erros (mapa), flashcards, usuários.
--
-- Rode no Supabase → SQL Editor (como postgres / service role).
-- Depois: deploy atual → /questoes/importar → Associar matérias e assuntos.
-- =============================================================================

BEGIN;

TRUNCATE TABLE
  study_session_notebooks,
  study_sessions,
  question_attempts,
  question_notes,
  notebook_questions,
  notebook_folders,
  notebooks,
  tec_taxonomy_mappings,
  question_options,
  questions
RESTART IDENTITY CASCADE;

COMMIT;

-- Tudo deve retornar 0
SELECT 'questions' AS tabela, COUNT(*)::int AS restante FROM questions
UNION ALL SELECT 'question_options', COUNT(*)::int FROM question_options
UNION ALL SELECT 'notebooks', COUNT(*)::int FROM notebooks
UNION ALL SELECT 'notebook_folders', COUNT(*)::int FROM notebook_folders
UNION ALL SELECT 'notebook_questions', COUNT(*)::int FROM notebook_questions
UNION ALL SELECT 'tec_taxonomy_mappings', COUNT(*)::int FROM tec_taxonomy_mappings
UNION ALL SELECT 'question_attempts', COUNT(*)::int FROM question_attempts
UNION ALL SELECT 'question_notes', COUNT(*)::int FROM question_notes
UNION ALL SELECT 'study_sessions', COUNT(*)::int FROM study_sessions
UNION ALL SELECT 'study_session_notebooks', COUNT(*)::int FROM study_session_notebooks
ORDER BY tabela;
