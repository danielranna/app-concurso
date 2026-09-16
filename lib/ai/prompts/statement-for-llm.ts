/**
 * Cap de enunciado enviado ao LLM (explain / note clarifications).
 *
 * Fórmula do plano: cap = min(max(round(p95 × 1.1), 4000), 6000).
 * Medição 2026-09-16: credenciais de DB indisponíveis no ambiente do agente —
 * usamos o teto duro 6000 (só trunca; questões curtas continuam enviando o
 * tamanho real). Reavaliar com amostra aleatória do banco todo (todas as
 * matérias) quando houver acesso; se p95×1.1 < 4000, o piso da fórmula é 4000.
 */
export const STATEMENT_LLM_MAX_CHARS = 6000

export const STATEMENT_TRUNCATED_SUFFIX = "…[enunciado truncado]"

/** Enuncia para o tutor: até o cap; se cortar, acrescenta sufixo literal. */
export function clipStatementForLlm(
  statement: string | null | undefined
): string {
  const text = (statement ?? "").trim()
  if (!text) return ""
  if (text.length <= STATEMENT_LLM_MAX_CHARS) return text
  const keep = Math.max(0, STATEMENT_LLM_MAX_CHARS - STATEMENT_TRUNCATED_SUFFIX.length)
  return text.slice(0, keep) + STATEMENT_TRUNCATED_SUFFIX
}
