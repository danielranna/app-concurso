# Via Aprovação — Resumo de Funcionalidades

> Plataforma pessoal de estudo para concursos públicos brasileiros.  
> Stack: Next.js 16, React 19, Supabase (Auth + PostgreSQL + Storage), Tailwind, Recharts, FSRS, PDF parse, IA opcional (BYOK OpenAI/Anthropic).

---

## Visão geral

App **single-user / multi-conta**: cada usuário vê apenas seus dados (RLS no Supabase). **Não há painel admin nem papéis** (admin, professor, etc.).

Combina 5 pilares:
1. **Mapa de erros** — registrar e revisar falhas de estudo
2. **Questões** — banco TEC, cadernos, importação PDF, estatísticas
3. **Flashcards** — repetição espaçada (FSRS) + bot WhatsApp
4. **Coach IA** — edital, incidência, relatórios, plano diário, priorização
5. **Agenda** — eventos, blocos diários, rotina semanal

---

## Autenticação

- Login e cadastro com e-mail/senha (Supabase Auth)
- Rotas protegidas no client (redirect para `/login`)
- IA via chave própria do usuário (`user_ai_credentials`)
- Bot de flashcards: autenticação separada com API key (`Bearer fc_...`)

---

## Módulos e rotas

### Início (`/`)
- Agenda do dia (dia/semana/mês)
- Widget de flashcards vencidos
- Questão errada aleatória para prática rápida
- Resumo de estatísticas e horas de estudo

### Mapa de erros (`/erros`)
- CRUD de erros (texto, correção, descrição, link, matéria, assunto, tipo, status)
- Taxonomia personalizável: matérias, assuntos, tipos de erro, status (com cor)
- Dashboard com abas: Semana, Tendência, Histórico, Análise de eficiência
- Detecção de outliers e flag automática `needs_intervention`
- `/subject/[id]` — visão por matéria com gráficos e filtros
- `/resumo-periodo` — sessão de revisão com filtros avançados, timer e pausa

### Questões (`/questoes`)
- **Banco global** deduplicado por `tec_id` (múltipla escolha e certo/errado)
- Metadados: banca, órgão, cargo, ano, matéria/assunto TEC, gabarito
- **Cadernos** com pastas hierárquicas, timer, retomada da questão ativa
- **Tentativas** com duração, confiança (seguro/inseguro/chute) e 6 categorias metacognitivas
- **Taxonomia de erro** por tentativa (heurística + LLM)
- **Notas** por questão (com histórico/auditoria)
- **Edições** do usuário (blocos acima/abaixo do enunciado)
- **Conteúdos compartilhados** reutilizáveis (texto/imagem)
- **Estudo combinado** — sessão unificando vários cadernos
- **Estatísticas** — gráficos por matéria/assunto/período
- **Mapeamento** TEC → matérias/assuntos do usuário
- Criação de cadernos a partir de: filtros, desempenho fraco, erros, Coach (inbox)

Rotas principais:
- `/questoes/banco` — filtros e criação de caderno
- `/questoes/importar` — wizard de importação PDF TEC
- `/questoes/importados` — cadernos sem matéria vinculada
- `/questoes/mapeamento` — associar taxonomia TEC
- `/questoes/conteudos` — biblioteca de conteúdos compartilhados
- `/questoes/semana` — estudo combinado multi-caderno
- `/questoes/estatisticas` — desempenho
- `/questoes/cadernos/[id]` — resolver caderno
- `/questoes/questao/[questionId]` — questão avulsa

### Importação PDF TEC
- Extração PDF → parser TEC → merge → qualidade → formatação
- Modos: único e em lote; preview antes do commit
- Revisão humana (needs review, baixa qualidade, warnings)
- Correções de texto PDF (regras + acrônimos editáveis)
- LLM opcional para casos difíceis
- Vinculação de conteúdos compartilhados no commit
- Upload de imagens para questões

### Flashcards (`/flashcards`)
- Tipos: basic, cloze_text, cloze_image (occlusão com IA)
- Agendamento **FSRS** com limites por dia da semana
- 1 baralho por matéria + cards órfãos
- Painel (vencidos, atrasados, todos), bulk delete, reagendamento manual
- Storage Supabase para imagens

Rotas: `/flashcards/study`, `/panel`, `/decks/[id]`, `/cards/new`, `/cards/[id]/edit`, `/settings`

### Bot WhatsApp (flashcards)
- Vincular/desvincular JID, autorizar usuário
- Janela horária configurável
- Bot externo consome API: sessões pendentes, dispatch due, respostas (rating 1–4)

### Coach IA (`/coach`)
- **Prova alvo**: banca, órgão, cargo, ano, edital ativo
- Upload: edital (PDF), incidência (XLSX), análise estratégica (MD)
- Análise de edital com IA; ranking de matérias; hierarquia de incidência
- **Relatórios de caderno** ao concluir: resumo MD + JSON (zonas vermelha/amarela/verde, ações)
- Modo rule-based (sem IA) ou LLM (BYOK)
- **Auditoria comportamental** por questão errada
- **Cérebro da matéria**: consolidação de tópicos, sinais, metacognição, timeline
- **Fila estratégica**: prioridade por incidência, gap, retenção
- **Plano diário**: blocos (questões, flashcards, erros, resumos) com modos pré/pós-edital e reta final
- **Inbox**: aprovar/rejeitar rascunhos de ações IA (ex.: criar caderno de reforço)
- **Jobs assíncronos**: relatório, classificação, ingestão no cérebro, recomputação estratégica, plano do dia

Rotas principais:
- `/coach/hoje` — plano diário
- `/coach/inbox` — pendências e ações IA
- `/coach/editais` — provas-alvo e documentos
- `/coach/executor` — matérias no executor do plano
- `/coach/configuracoes` — modo de estudo, limites, preferências
- `/coach/materias/[subjectId]/insights` — fila estratégica e reforço
- `/coach/materias/[subjectId]/prioridades` — breakdown de prioridades
- `/coach/materias/[subjectId]/cerebro` — mapa de tópicos
- `/coach/relatorios/[id]` — detalhe e regeneração de relatório

### Agenda
- Eventos com data, cor e notas
- Blocos diários (horário início/fim)
- Rotina semanal por dia
- Plano do dia integrado à home

---

## Fluxos especiais

### Pipeline pós-caderno (Coach)
1. Caderno concluído → `report_pending`
2. Job gera relatório (regras ou LLM)
3. Job classifica tentativas erradas
4. Job atualiza cérebro da matéria
5. Job recomputa fila estratégica
6. Rascunhos na inbox → usuário aprova → caderno efêmero criado

### Plano diário
- Cruza executor + fila estratégica + erros elegíveis + flashcards due
- Respeita limites e modo (pré-edital / pós-edital / reta final)

### RAG / embeddings
- Infraestrutura SQL existe (`document_chunks`, embeddings)
- **Upload de material de estudo descontinuado** — RAG não ativo hoje
- Relatórios IA usam tentativas, notas e incidência (não RAG de PDFs)

---

## Modelo de dados (principais entidades)

| Domínio | Tabelas |
|---------|---------|
| Erros | `subjects`, `topics`, `errors`, `error_types`, `error_statuses`, `review_sessions`, `user_preferences` |
| Questões | `questions`, `question_options`, `question_attempts`, `notebooks`, `notebook_folders`, `study_sessions`, `user_question_edits`, `user_shared_assets` |
| Importação | `tec_taxonomy_mappings`, `pdf_text_correction_rules`, `pdf_text_acronyms` |
| Flashcards | `flashcard_decks`, `flashcards`, `flashcard_states`, `flashcard_review_logs`, `flashcard_bot_*`, `flashcard_api_keys` |
| Coach | `exam_targets`, `subject_brain_state`, `strategic_queue_items`, `daily_study_plans`, `ai_jobs`, `ai_action_drafts`, `learning_signals`, `subject_notebook_reports` |
| Agenda | `agenda_events`, `agenda_daily_blocks`, `agenda_weekly_blocks`, `agenda_daily_block_plans` |

---

## APIs (~130 rotas REST)

Principais domínios: `/api/errors`, `/api/subjects`, `/api/topics`, `/api/questions`, `/api/notebooks`, `/api/study-sessions`, `/api/flashcards`, `/api/coach`, `/api/agenda`, `/api/home`, `/api/analysis`, `/api/review-sessions`, `/api/shared-assets`

---

## Integrações

- **Supabase** — Auth, DB, Storage (`coach-documents`, `flashcard-images`)
- **OpenAI / Anthropic** — completions e embeddings (BYOK)
- **TEC Concursos** — importação via PDF parseado localmente
- **WhatsApp** — bot externo via API de flashcards
- **Vercel** — deploy

---

## Configurações do usuário (sem admin global)

- Mapa de erros: matérias, assuntos, tipos, status
- Coach: modo de estudo, limites, preferências de relatório
- Flashcards: limites semanais, bot, API keys
- Chave de IA (OpenAI/Anthropic)
- Correções de texto PDF na importação
- Mapeamento TEC ↔ matérias próprias

---

## Testes automatizados

Parser PDF TEC, merge, qualidade, formatação, correções de texto, classificador de erros IA, auditoria comportamental, FSRS due dates, regressão de importação PDF.

---

## Resumo em uma frase

**Via Aprovação** é uma central de estudo pessoal para concursos que une mapa de erros com revisão inteligente, banco de questões TEC com importação PDF, flashcards FSRS (incl. bot WhatsApp), agenda e Coach IA que analisa editais/incidência, gera relatórios de cadernos, prioriza tópicos e monta o plano diário.
