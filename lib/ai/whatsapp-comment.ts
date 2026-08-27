export const WHATSAPP_AI_SEPARATOR = "— Comentário da IA —"

const GENERIC_FALLBACK =
  "Revise a explicação no relatório do caderno ou regenere as explicações com IA."

export function isPublishableAiFeedback(text: string | null | undefined): boolean {
  const trimmed = text?.trim() ?? ""
  if (trimmed.length < 40) return false
  if (trimmed.includes(GENERIC_FALLBACK)) return false
  return true
}

export function formatWhatsappComment(
  noteBody: string | null | undefined,
  aiFeedback?: string | null
): string {
  const { comment, aiComment } = splitPublishParts(noteBody, aiFeedback)
  if (comment && aiComment) return `${comment}\n\n${WHATSAPP_AI_SEPARATOR}\n${aiComment}`
  return comment || aiComment || ""
}

export function splitPublishParts(
  noteBody: string | null | undefined,
  aiFeedback?: string | null
): { comment: string | null; aiComment: string | null } {
  const note = noteBody?.trim() ?? ""
  const ai = isPublishableAiFeedback(aiFeedback) ? aiFeedback!.trim() : ""
  return {
    comment: note || null,
    aiComment: ai || null,
  }
}
