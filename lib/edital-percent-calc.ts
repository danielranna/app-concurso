import { normLabel } from "./incidence-subject-map"

export type PercentBreakdown = {
  percent_of_total: number
  percent_calculation: string
}

/** % só sobre matérias objetivas (discursivas fora do denominador). */
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
      ? `Soma das questões objetivas: ${total}. Cada % = (questões da matéria ÷ ${total}) × 100. Provas/matérias discursivas não entram no total.`
      : "O edital não informou quantidades de questões objetivas suficientes para calcular % pelo método questões/total."

  const byName = new Map<string, PercentBreakdown>()

  for (const item of items) {
    const key = normLabel(item.name)
    if (total > 0 && item.q > 0) {
      const pct = Math.round((item.q / total) * 10000) / 100
      byName.set(key, {
        percent_of_total: pct,
        percent_calculation: `${item.q} questões ÷ ${total} questões objetivas × 100 = ${pct.toFixed(2)}%`,
      })
    } else if (total > 0 && item.q === 0) {
      byName.set(key, {
        percent_of_total: 0,
        percent_calculation:
          "0 questões objetivas atribuídas no edital (matéria pode ser só discursiva ou sem quantitativo).",
      })
    } else {
      byName.set(key, {
        percent_of_total: 0,
        percent_calculation:
          "Sem total de questões objetivas no edital — % estimada pela IA por peso/pontuação, se houver.",
      })
    }
  }

  return { byName, totalObjectiveQuestions: total, formulaNote }
}

export function applyObjectivePercentToRank<
  T extends {
    subject_name: string
    question_count?: number
    percent_of_total?: number
    percent_calculation?: string
  },
>(rank: T[], objectiveSubjects: { name: string; question_count?: number }[]): T[] {
  const { byName, totalObjectiveQuestions, formulaNote } =
    computeObjectivePercentBreakdown(objectiveSubjects)

  return rank.map((row) => {
    const key = normLabel(row.subject_name)
    const calc = byName.get(key)
    const q = Math.max(0, Number(row.question_count) || 0)

    if (totalObjectiveQuestions > 0 && q > 0 && calc) {
      return {
        ...row,
        percent_of_total: calc.percent_of_total,
        percent_calculation:
          row.percent_calculation?.trim() || calc.percent_calculation,
      }
    }

    if (calc && !row.percent_calculation) {
      return { ...row, percent_calculation: calc.percent_calculation }
    }

    if (!row.percent_calculation && totalObjectiveQuestions > 0) {
      return {
        ...row,
        percent_calculation: formulaNote,
      }
    }

    return row
  })
}
