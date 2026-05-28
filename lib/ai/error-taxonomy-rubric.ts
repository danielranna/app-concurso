/**
 * Rubrica de classificação de erros (concurso público).
 * Baseada nos critérios do relatório de taxonomia do aluno.
 */

export const ERROR_TAXONOMY_IDS = [
  "desatencao",
  "pegadinha_interpretacao",
  "falta_compreensao",
  "calculo_procedimento",
  "falta_memorizacao",
  "nao_aplicavel",
] as const

export const ERROR_TAXONOMY_CLASSIFY_PROMPT = `Você é um especialista em diagnóstico de erros em questões de concurso público.

TAREFA: classificar CADA questão em UMA única categoria de erro (error_taxonomy).
A zona (red/yellow) indica fragilidade metacognitiva — NÃO determine a taxonomia pela zona.
Use análise profunda do enunciado, alternativas, gabarito, nota do aluno (user_note) e histórico.

REGRA MÁXIMA: se user_note existir, ela tem prioridade — extraia o raciocínio do aluno e classifique com base nele.

CATEGORIAS (escolha exatamente uma):

1) falta_memorizacao — decoreba, dado factual, prazo, data, alíquota, percentual, competência, classificação taxativa.
   Exemplos: prazos LRF/RREO; vigência/decadência; idade mínima; repartições constitucionais; limites fiscais; quorum.
   Decorebas BOAS: princípios orçamentários, estágios da despesa, tipos de créditos adicionais.
   Decorebas RUINS (evitar rotular só por ser "conceito"): definição filosófica genérica sem dado factual.

2) falta_compreensao — estrutura mental errada; confusão entre conceitos parecidos; aplicação ruim com memória ok.
   Sinais: descentralização x desconcentração; receita extra x orçamentária; anulação x revogação; autorização x permissão.
   Erro contextualizado (sabe regra literal, erra caso prático); justificativa incompatível na nota; troca causa/efeito;
   erro recorrente mesmo após revisão (não é só memória).

3) desatencao — conteúdo dominado, falha pontual de execução/leitura.
   Sinais: já acertou questões iguais antes; marcou alternativa "compatível" mas não a pedida (ex.: pediu incorreta, marcou correta);
   erro em palavra-chave da banca (EXCETO, INCORRETA, NÃO, SOMENTE, OBRIGATORIAMENTE) com conteúdo aparentemente sabido.

4) pegadinha_interpretacao — interpretação, nuance, generalização indevida, linguagem ambígua.
   Sinais: alternativas muito parecidas (poderá/deverá/somente); 90% da frase certa e um detalhe invalida; dupla negativa;
   inversão sintática; regra geral aplicada onde havia exceção.

5) calculo_procedimento — erro operacional, sequência, etapa esquecida, metodologia parcialmente correta.

6) nao_aplicavel — só se realmente não houver padrão de erro identificável (raro).

Para questões AMARELAS com acerto (conhecimento_fragil, inseguro): classifique o TIPO DE FRAGILIDADE/RISCO
(ex.: pegadinha se quase caiu em nuance; falta_compreensao se lógica frágil na nota), não trate como "sem erro".

Responda JSON estrito:
{
  "items": [
    {
      "question_id": "uuid",
      "error_taxonomy": "falta_memorizacao|...",
      "specific_mistake": "frase curta do equívoco",
      "evidence": ["motivo 1", "motivo 2"],
      "confidence": "alta|media|baixa"
    }
  ]
}

Inclua TODAS as questões do input. Nunca use pegadinha_interpretacao como padrão genérico.`

export const ERROR_TAXONOMY_RUBRIC_SECTIONS = {
  falta_memorizacao: [
    "Datas, prazos, vigência, decadência, prescrição, prazos processuais",
    "Alíquotas, percentuais, repartições, limites fiscais, quorum",
    "Competências e atribuições (constitucional/administrativo)",
    "Decorebas filtradas: princípios orçamentários, estágios da despesa, créditos adicionais",
  ],
  falta_compreensao: [
    "Confusão entre conceitos parecidos (fortíssimo sinal)",
    "Erro em questão contextualizada (memória ok, aplicação ruim)",
    "Justificativa incompatível na nota do aluno",
    "Troca de causa e efeito",
    "Erro recorrente após revisão (estrutura mental, não só memória)",
  ],
  desatencao: [
    "Domínio prévio demonstrado + erro pontual",
    "Marcou alternativa compatível mas não a pedida",
    "Palavra-chave da banca: EXCETO, INCORRETA, NÃO, SEMPRE, SOMENTE",
  ],
  pegadinha_interpretacao: [
    "Generalização indevida / exceção da banca",
    "Linguagem ambígua, dupla negativa, nuance entre alternativas",
    "90% correto + detalhe invalida (CESPE)",
  ],
  calculo_procedimento: [
    "Erro operacional simples",
    "Sequência errada, etapa esquecida",
    "Metodologia parcialmente correta",
  ],
} as const
