import { normLabel } from "./incidence-subject-map"

export type PercentBreakdown = {
  percent_of_total: number
  percent_calculation: string
}

/** Fallback só quando o edital não trouxe % nos critérios — por contagem de questões objetivas. */
export function computeObjectivePercentBreakdown(
  subjects: { name: string; question_count?: number }[]
): {
  byName: Map<string, PercentBreakdown>
  totalObjectiveQuestions: number
  formulaNote: string
} {
  const items = subjects.map((s) => ({
    name: s.name,
    q: Math.max(0, Number(s.question_count) || 0),
  }))
  const total = items.reduce((sum, i) => sum + i.q, 0)

  const formulaNote =
    total > 0
      ? `Referência alternativa (só se os critérios de avaliação do PDF não definirem %): soma ${total} questões objetivas; % = questões da matéria ÷ ${total} × 100. Discursivas fora.`
      : "Sem quantidades objetivas no PDF para fallback por questões."

  const byName = new Map<string, PercentBreakdown>()

  for (const item of items) {
    const key = normLabel(item.name)
    if (total > 0 && item.q > 0) {
      const pct = Math.round((item.q / total) * 10000) / 100
      byName.set(key, {
        percent_of_total: pct,
        percent_calculation: `[Fallback] ${item.q} ÷ ${total} × 100 = ${pct.toFixed(2)}% — use critérios de avaliação do PDF se houver peso explícito.`,
      })
    } else {
      byName.set(key, {
        percent_of_total: 0,
        percent_calculation:
          "Definir % apenas pelos critérios de avaliação do PDF (trecho não encontrado automaticamente).",
      })
    }
  }

  return { byName, totalObjectiveQuestions: total, formulaNote }
}

/** Não sobrescreve % da IA; só preenche lacunas sem percent_calculation. */
export function fillMissingPercentFromQuestions<
  T extends {
    subject_name: string
    question_count?: number
    percent_of_total?: number
    percent_calculation?: string
  },
>(rank: T[], objectiveSubjects: { name: string; question_count?: number }[]): T[] {
  const { byName, totalObjectiveQuestions } =
    computeObjectivePercentBreakdown(objectiveSubjects)

  return rank.map((row) => {
    if (row.percent_calculation?.trim()) return row
    if (row.percent_of_total != null && row.percent_of_total > 0) return row

    const key = normLabel(row.subject_name)
    const calc = byName.get(key)
    const q = Math.max(0, Number(row.question_count) || 0)

    if (totalObjectiveQuestions > 0 && q > 0 && calc) {
      return {
        ...row,
        percent_of_total: calc.percent_of_total,
        percent_calculation: calc.percent_calculation,
      }
    }

    return row
  })
}
