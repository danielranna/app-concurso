import type { ExamPlanStructured } from "./coach-types"

const DAY_PT: Record<string, string> = {
  seg: "Segunda",
  ter: "Terça",
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
  sab: "Sábado",
  dom: "Domingo",
}

const RESOURCE_PT: Record<string, string> = {
  questoes: "Questões",
  flashcards: "Flashcards",
  erros: "Mapa de erros",
}

export function parseCoachEditalJson(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>
      } catch {
        /* fall through */
      }
    }
    return { headline: "Plano gerado", raw: text }
  }
}

export function asExamPlanStructured(
  raw: Record<string, unknown>
): ExamPlanStructured {
  return raw as ExamPlanStructured
}

function dayLabel(day: string) {
  return DAY_PT[day.toLowerCase()] ?? day
}

function resourceLabel(r: string) {
  return RESOURCE_PT[r.toLowerCase()] ?? r
}

export function buildCoachEditalSummaryMd(
  examName: string,
  structured: ExamPlanStructured
): string {
  const lines: string[] = [`# Plano — ${examName}`, ""]

  if (structured.headline) {
    lines.push(structured.headline, "")
  }

  if (structured.edital_summary) {
    lines.push("## Resumo do edital", "", structured.edital_summary, "")
  }

  if (structured.objective_percent_formula) {
    lines.push("## Regra do % (só prova objetiva)", "", structured.objective_percent_formula, "")
  }

  if (structured.subject_priority_rank?.length) {
    lines.push("## Ranking de relevância das matérias", "")
    for (const row of structured.subject_priority_rank) {
      const meta = [
        row.edital_weight && `peso ${row.edital_weight}`,
        row.question_count != null && `${row.question_count} quest.`,
        row.percent_of_total != null && `${row.percent_of_total}%`,
        row.prova && row.prova,
      ]
        .filter(Boolean)
        .join(" · ")
      lines.push(
        `${row.priority}. **${row.subject_name}**${meta ? ` (${meta})` : ""}`,
        `   ${row.why || "—"}`,
        row.percent_calculation ? `   Cálculo %: ${row.percent_calculation}` : ""
      )
    }
    lines.push("")
  }

  if (structured.priority_subjects?.length) {
    lines.push("## Matérias prioritárias", "")
    for (const s of structured.priority_subjects) {
      lines.push(`- **${s.name}** — ${s.why || ""}`)
    }
    lines.push("")
  }

  if (structured.secondary_subjects?.length) {
    lines.push("## Matérias secundárias", "")
    for (const s of structured.secondary_subjects) {
      lines.push(`- **${s.name}** — ${s.why || ""}`)
    }
    lines.push("")
  }

  if (structured.discursive_subjects?.length) {
    lines.push("## Provas / matérias discursivas (fora do ranking objetivo)", "")
    if (structured.discursive_note) {
      lines.push(structured.discursive_note, "")
    }
    for (const d of structured.discursive_subjects) {
      const meta = [
        d.question_count != null && `${d.question_count} itens`,
        d.percent_of_total != null && `${d.percent_of_total}%`,
        d.prova,
      ]
        .filter(Boolean)
        .join(" · ")
      lines.push(
        `- **${d.name}**${meta ? ` (${meta})` : ""}`,
        d.note ? `  ${d.note}` : ""
      )
    }
    lines.push("")
  }

  if (structured.trap_subjects?.length) {
    lines.push("## Matérias armadilha", "")
    for (const s of structured.trap_subjects) {
      lines.push(`- **${s.name}** — ${s.why || ""}`)
    }
    lines.push("")
  }

  if (structured.strategic_conclusions?.length) {
    lines.push("## Conclusões estratégicas", "")
    for (const c of structured.strategic_conclusions) {
      lines.push(`- ${c}`)
    }
    lines.push("")
  }

  if (structured.weekly_plan?.length) {
    lines.push("## Semana sugerida", "")
    for (const row of structured.weekly_plan) {
      lines.push(
        `- **${dayLabel(row.day)}:** ${row.focus} · ${row.minutes} min · ${resourceLabel(row.resource)}`
      )
    }
    lines.push("")
  }

  if (structured.executable_actions?.length) {
    lines.push("## Ações sugeridas", "")
    for (const a of structured.executable_actions) {
      lines.push(`- ${a.label}`)
    }
    lines.push("")
  }

  if (structured.risks_if_ignored?.length) {
    lines.push("## Riscos se ignorar", "")
    for (const r of structured.risks_if_ignored) {
      lines.push(`- ${r}`)
    }
  }

  return lines.join("\n").trim()
}
