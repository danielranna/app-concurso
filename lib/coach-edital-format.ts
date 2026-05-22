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

  if (structured.subject_priority_rank?.length) {
    lines.push("## Prioridade das matérias", "")
    for (const row of structured.subject_priority_rank) {
      lines.push(
        `${row.priority}. **${row.subject_name}** — ${row.why || "—"}`
      )
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
