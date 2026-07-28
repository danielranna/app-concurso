export type SequencePattern = "confusao" | "aprendizado" | "esquecimento"

export type SequencePatternResult = {
  pattern: SequencePattern | null
  switches: number
  trailing_correct: number
  sequence_preview: string
}

const MIN_ATTEMPTS = 4
const CONSOLIDATION_STREAK = 3
const CONFUSION_MIN_SWITCHES = 3
const CONFUSION_SWITCH_RATIO = 0.45

export function sequencePreview(seq: boolean[]): string {
  return seq.map((ok) => (ok ? "A" : "E")).join("-")
}

export function countSwitches(seq: boolean[]): number {
  let n = 0
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] !== seq[i - 1]) n++
  }
  return n
}

export function trailingCorrectCount(seq: boolean[]): number {
  let n = 0
  for (let i = seq.length - 1; i >= 0; i--) {
    if (!seq[i]) break
    n++
  }
  return n
}

/** True if a streak of ≥3 correct was followed later by at least one wrong. */
export function hadCorrectStreakThenWrong(seq: boolean[]): boolean {
  let streak = 0
  let sawConsolidated = false
  for (const ok of seq) {
    if (ok) {
      streak++
      if (streak >= CONSOLIDATION_STREAK) sawConsolidated = true
    } else {
      if (sawConsolidated) return true
      streak = 0
    }
  }
  return false
}

/**
 * Classifica o padrão dominante da sequência cronológica de acertos/erros.
 * Prioridade: esquecimento > aprendizado > confusão.
 */
export function classifySequencePattern(seq: boolean[]): SequencePatternResult {
  const switches = countSwitches(seq)
  const trailing_correct = trailingCorrectCount(seq)
  const sequence_preview = sequencePreview(seq)

  if (seq.length < MIN_ATTEMPTS) {
    return { pattern: null, switches, trailing_correct, sequence_preview }
  }

  const hasWrong = seq.some((ok) => !ok)
  const hasCorrect = seq.some((ok) => ok)

  if (hadCorrectStreakThenWrong(seq)) {
    return {
      pattern: "esquecimento",
      switches,
      trailing_correct,
      sequence_preview,
    }
  }

  if (hasWrong && trailing_correct >= CONSOLIDATION_STREAK) {
    return {
      pattern: "aprendizado",
      switches,
      trailing_correct,
      sequence_preview,
    }
  }

  const ratio = switches / (seq.length - 1)
  if (
    hasWrong &&
    hasCorrect &&
    switches >= CONFUSION_MIN_SWITCHES &&
    ratio >= CONFUSION_SWITCH_RATIO
  ) {
    return {
      pattern: "confusao",
      switches,
      trailing_correct,
      sequence_preview,
    }
  }

  return { pattern: null, switches, trailing_correct, sequence_preview }
}

export const SEQUENCE_PATTERN_LABELS: Record<SequencePattern, string> = {
  confusao: "Possível confusão",
  aprendizado: "Possível aprendizado",
  esquecimento: "Possível esquecimento",
}
