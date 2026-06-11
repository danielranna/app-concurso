export type PrioritySource = "crossed" | "brain"

export type StudyMode = "pre_edital" | "pos_edital" | "reta_final"

/** Pré-edital usa fila brain; pós-edital e reta final usam crossed (incidência × fraqueza). */
export function resolvePrioritySource(studyMode: StudyMode): PrioritySource {
  return studyMode === "pre_edital" ? "brain" : "crossed"
}

export const PRIORITY_SOURCE_LABELS: Record<
  PrioritySource,
  { label: string; description: string }
> = {
  brain: {
    label: "Cérebro (pré-edital)",
    description: "Prioridade só pela fraqueza — sem peso de incidência.",
  },
  crossed: {
    label: "Cruzada (pós-edital)",
    description: "Incidência × fraqueza — fila estratégica do edital.",
  },
}
