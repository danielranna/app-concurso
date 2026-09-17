/** Blocos compartilhados NOTE_CLARIFICATION + UNIFIED_EXPLAIN (evitar drift). */

export const TUTOR_ANTI_HALLUCINATION = `ANTI-ALUCINAÇÃO (obrigatório):
- PROIBIDO citar artigo, inciso, parágrafo, súmula, lei, decreto, resolução, data, prazo, alíquota, percentual, valor ou fórmula que NÃO apareçam literalmente em statement, options, marked_option_text, correct_option_text ou na user_note/note_body.
- Se precisar de um dado normativo e ele não estiver no input: escreva "o enunciado/alternativas não trazem esse dispositivo/número" e explique com a lógica disponível — NUNCA complete de memória.
- Números que ESTÃO no enunciado/options DEVEM ser reutilizados fielmente (ver regra de cálculo).`

export const TUTOR_CALCULO_RULES = `CÁLCULO / PROCEDIMENTO NUMÉRICO (quando aplicável):
Aplique esta seção se QUALQUER um for verdadeiro:
(a) error_taxonomy_hint / error_taxonomy = "calculo_procedimento";
(b) correct_option_text ou marked_option_text for valor numérico/monetário/percentual;
(c) statement ou options trouxerem quantias, saldos, alíquotas, índices ou pedido explícito de apuração;
(d) na NOTE: a note_body pedir como calcular, conferir conta, "como chega", exemplo numérico.

OBRIGATÓRIO nesse caso:
0) Formatação: reproduza cada valor numérico com a MESMA formatação do input (separador de milhar, casas decimais, símbolo de moeda). Não normalize "R$ 8.000,00" para "8.000" na conta — isso gera falsa divergência.
1) Listar os dados numéricos USADOS com os valores exatamente como no input (rótulo curto + número).
2) Mostrar a sequência de operações com conta explícita em cada passo (ex.: "AC R$ 8.000,00 + ARLP R$ 1.200,00 = R$ 9.200,00").
3) Fechamento com o gabarito:
   - Se a sequência com os dados do input fechar exatamente no valor de correct_option_text, declare esse match.
   - Se NÃO fechar: NÃO force o resultado para bater no gabarito. Declare a divergência em 1 frase (ex.: "Com os dados fornecidos obteve-se X, distinto do gabarito Y") e mostre a conta como foi feita. Não invente parcelas para "corrigir" a diferença.
4) Hipótese de erro da alternativa marcada (só se marked for numérico e distinto do gabarito):
   - Formule no máximo UMA hipótese de omissão/sinal/alíquota/parcela usando somente números do input.
   - SÓ apresente essa hipótese se, ao aplicar a lógica proposta aos números do input, o resultado bater EXATAMENTE com marked_option_text (verificação reversa obrigatória no raciocínio).
   - Se a verificação falhar ou for impossível reconstruir: OMITA o passo 4 por completo — não diga "plausível", não chute o equívoco do aluno.
5) PROIBIDO frases-guarda-chuva: "considera todos os elementos/ajustes", "após os devidos cálculos", "aplicando a fórmula correta" sem exibir a operação.
6) Se faltar no input algum número necessário: declare a lacuna e NÃO invente o missing number.

Fora desses casos, NÃO invente um exercício numérico.`

export const TUTOR_JSON_ONLY = `Responda APENAS com um único objeto JSON válido (RFC 8259). Sem preâmbulo, sem markdown, sem \`\`\` , sem comentários.`

/** Frases-guarda-chuva proibidas no feedback de explain (LLM e detecção pós-hoc). */
export const EXPLAIN_UMBRELLA_PHRASES = [
  "reflete o conceito cobrado",
  "não responde ao que o enunciado pede",
  "compare cada alternativa com o trecho-chave",
  "indica onde revisar",
  "há confusão conceitual entre ideias parecidas",
  "após os devidos cálculos",
  "considera todos os elementos",
  "aplicando a fórmula correta",
] as const

export function isUmbrellaExplainFeedback(
  text: string | null | undefined
): boolean {
  const t = (text ?? "").trim().toLowerCase()
  if (!t) return true
  return EXPLAIN_UMBRELLA_PHRASES.some((p) => t.includes(p))
}

export const TUTOR_CONCEPTUAL_RULES = `EXPLICAÇÃO CONCEITUAL / JURÍDICA (quando NÃO for caso de CÁLCULO):
1) Extraia do statement o CRITÉRIO cobrado (o que a banca pede para escolher a certa — ex.: "matéria cujas normas gerais exigem lei complementar", "asserção INCORRETA", "exceção à regra"). Cite esse critério em palavras próximas ao enunciado.
2) Para a alternativa marcada: diga POR QUE o texto dela NÃO satisfaz esse critério, usando trechos da própria marcada (marked_option_text) — não diga só que "não responde".
3) Para o gabarito: diga POR QUE o texto dele SATISFAZ o critério, usando correct_option_text — PROIBIDO "encaixa porque reflete o conceito cobrado" ou equivalentes circulares.
4) Se user_note citar outra letra (A–E) ou "dúvida na X": OBRIGATÓRIO confrontar essa alternativa (texto em options) com o mesmo critério em 1 frase. Isso não é "esclarecer a nota em profundidade"; é fechar o equívoco residual da auditoria.
5) PROIBIDO no feedback: "reflete o conceito cobrado", "não responde ao que o enunciado pede" (sozinho), "compare cada alternativa com o trecho-chave", "indica onde revisar" + conselho genérico, "há confusão conceitual entre ideias parecidas" sem nomear as ideias.
6) Sem inventar dispositivo legal fora do input (ver ANTI-ALUCINAÇÃO). Se o vínculo for só pelo texto das options vs critério do enunciado, explique por contraste textual.`
