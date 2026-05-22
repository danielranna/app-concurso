-- Reset completo do módulo de questões (banco global TEC + cadernos + histórico)
-- Rode no Supabase SQL Editor. NÃO apaga subjects, topics, erros nem flashcards.
--
-- Depois: reimporte os PDFs e refaça os vínculos em Associar matérias/assuntos.

BEGIN;

-- Sessões de estudo combinado
TRUNCATE TABLE study_session_notebooks CASCADE;
TRUNCATE TABLE study_sessions CASCADE;

-- Histórico e notas por questão
TRUNCATE TABLE question_attempts CASCADE;
TRUNCATE TABLE question_notes CASCADE;

-- Cadernos do usuário (links com questões)
TRUNCATE TABLE notebook_questions CASCADE;
TRUNCATE TABLE notebooks CASCADE;
TRUNCATE TABLE notebook_folders CASCADE;

-- Mapeamentos TEC → suas matérias/temas
TRUNCATE TABLE tec_taxonomy_mappings CASCADE;

-- Banco global (questões + alternativas; CASCADE remove question_options)
TRUNCATE TABLE question_options CASCADE;
TRUNCATE TABLE questions CASCADE;

COMMIT;

-- Conferência (deve retornar 0 em todas)
SELECT 'questions' AS tabela, COUNT(*) AS total FROM questions
UNION ALL SELECT 'question_options', COUNT(*) FROM question_options
UNION ALL SELECT 'notebooks', COUNT(*) FROM notebooks
UNION ALL SELECT 'notebook_questions', COUNT(*) FROM notebook_questions
UNION ALL SELECT 'tec_taxonomy_mappings', COUNT(*) FROM tec_taxonomy_mappings
UNION ALL SELECT 'question_attempts', COUNT(*) FROM question_attempts
UNION ALL SELECT 'question_notes', COUNT(*) FROM question_notes
UNION ALL SELECT 'study_sessions', COUNT(*) FROM study_sessions;
