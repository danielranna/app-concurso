import type { SubjectStudyDossierStructured } from "../../coach-types"
import type { SubjectDossierPayload } from "../subject-dossier-payload"
import {
  buildClarificationsFromCache,
  buildDossierClarificationItems,
  isSubstantiveClarification,
  runNoteClarificationsAgent,
  type NoteClarificationsResult,
} from "../note-clarifications"

export type AnnotationClarificationsResult = NoteClarificationsResult & {
  clarifications: SubjectStudyDossierStructured["annotation_clarifications"]
}

export async function runAnnotationClarificationsAgent(params: {
  userId: string
  subjectId: string
  payload: SubjectDossierPayload
  skipLlm?: boolean
}): Promise<AnnotationClarificationsResult> {
  const notes = params.payload.annotations.filter((a) => a.note_body.trim())
  if (!notes.length) {
    return {
      clarifications: [],
      byQuestionId: new Map(),
      usedLlm: false,
      modelUsed: "rule-based",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    }
  }

  const allCached = notes.every((a) =>
    isSubstantiveClarification(a.cached_feedback)
  )

  if (allCached) {
    const clarifications = buildClarificationsFromCache(notes)
    const byQuestionId = new Map(
      clarifications.map((c) => [c.question_id, c.answer_md])
    )
    return {
      clarifications,
      byQuestionId,
      usedLlm: false,
      modelUsed: "cached",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    }
  }

  const pendingAnnotations = notes.filter(
    (a) => !isSubstantiveClarification(a.cached_feedback)
  )
  const cachedAnnotations = notes.filter((a) =>
    isSubstantiveClarification(a.cached_feedback)
  )

  const items = buildDossierClarificationItems(pendingAnnotations, params.payload)

  const result = await runNoteClarificationsAgent({
    userId: params.userId,
    subjectId: params.subjectId,
    items,
    subjectName: params.payload.subject_name,
    skipLlm: params.skipLlm,
    agentType: "dossier",
  })

  const cachedClarifications = buildClarificationsFromCache(cachedAnnotations)
  const merged = [...cachedClarifications, ...result.clarifications]
  const byQuestionId = new Map<string, string>()
  for (const c of merged) {
    if (c.answer_md?.trim()) byQuestionId.set(c.question_id, c.answer_md.trim())
  }

  return {
    clarifications: merged,
    byQuestionId,
    usedLlm: result.usedLlm,
    modelUsed: result.modelUsed,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
  }
}

export {
  buildClarificationsFromCache,
  isSubstantiveClarification,
} from "../note-clarifications"
