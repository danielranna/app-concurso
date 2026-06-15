import type { DailyStudyBlock } from "./coach-types"
import type { StudyCycleBlock } from "./study-cycle-types"
import { pickQuestionIdsFromPerformance } from "./notebook-from-performance"
import { getContentNode } from "./content-index-db"
import { getContentBlock } from "./study-cycle-content-blocks-db"

export async function buildDailyBlocksFromCycleBlocks(
  userId: string,
  cycleBlocks: StudyCycleBlock[],
  subjectNames: Map<string, string>
): Promise<DailyStudyBlock[]> {
  const blocks: DailyStudyBlock[] = []
  const questionIdsAll: string[] = []

  for (const cb of cycleBlocks.sort((a, b) => a.sort_order - b.sort_order)) {
    const subjectName = subjectNames.get(cb.subject_id) ?? cb.subject_name ?? "Matéria"
    const blockKey = `cycle:${cb.day_index}:${cb.sort_order}:${cb.block_type}`

    if (cb.block_type === "questions") {
      let notebookId = cb.params.notebook_id ?? null
      let nodeName = cb.content_node_name ?? cb.label

      if (cb.content_node_id) {
        const node = await getContentNode(userId, cb.content_node_id)
        if (node) {
          notebookId = node.notebook_id ?? notebookId
          nodeName = node.name
        }
      }

      const limit = Number(cb.params.question_count ?? 20)
      let questionIds: string[] = []

      if (cb.content_block_id) {
        const contentBlock = await getContentBlock(userId, cb.content_block_id)
        if (contentBlock?.topics.length) {
          const tecTopics = contentBlock.topics
            .map((t) => t.tec_topic)
            .filter(Boolean)
          nodeName = contentBlock.name
          if (tecTopics.length) {
            questionIds = await pickQuestionIdsFromPerformance(userId, {
              subject_id: cb.subject_id,
              tec_topics: tecTopics,
              wrong_only: true,
              min_wrong_attempts: 1,
              limit,
            })
            if (questionIds.length < limit) {
              const pending = await pickQuestionIdsFromPerformance(userId, {
                subject_id: cb.subject_id,
                tec_topics: tecTopics,
                wrong_only: false,
                limit: limit - questionIds.length,
              })
              questionIds = [
                ...questionIds,
                ...pending.filter((id) => !questionIds.includes(id)),
              ]
            }
          }
        }
      } else if (notebookId) {
        questionIds = await pickQuestionIdsFromPerformance(userId, {
          subject_id: cb.subject_id,
          source_notebook_id: notebookId,
          wrong_only: true,
          min_wrong_attempts: 1,
          limit,
        })
        if (questionIds.length < limit) {
          const pending = await pickQuestionIdsFromPerformance(userId, {
            subject_id: cb.subject_id,
            source_notebook_id: notebookId,
            wrong_only: false,
            limit: limit - questionIds.length,
          })
          questionIds = [...questionIds, ...pending.filter((id) => !questionIds.includes(id))]
        }
      } else if (cb.content_node_id) {
        const node = await getContentNode(userId, cb.content_node_id)
        if (node?.tec_topic) {
          questionIds = await pickQuestionIdsFromPerformance(userId, {
            subject_id: cb.subject_id,
            tec_topics: [node.tec_topic],
            wrong_only: true,
            min_wrong_attempts: 1,
            limit,
          })
        }
      }

      if (questionIds.length) {
        questionIdsAll.push(...questionIds)
        blocks.push({
          subject_id: cb.subject_id,
          subject_name: subjectName,
          type: "questions",
          count: questionIds.length,
          minutes: Number(cb.params.minutes ?? Math.min(90, questionIds.length * 4)),
          label: cb.label || `${nodeName} (${questionIds.length} questões)`,
          params: {
            block_key: blockKey,
            question_ids: questionIds,
            notebook_id: notebookId,
            content_node_id: cb.content_node_id,
            content_block_id: cb.content_block_id,
            cycle_block: true,
          },
        })
      } else {
        blocks.push({
          subject_id: cb.subject_id,
          subject_name: subjectName,
          type: "read_material",
          count: 1,
          minutes: Number(cb.params.minutes ?? 15),
          label: cb.label || `${nodeName} — sem questões elegíveis ainda`,
          params: {
            block_key: blockKey,
            content_node_id: cb.content_node_id,
            content_block_id: cb.content_block_id,
            notebook_id: notebookId,
            cycle_block: true,
          },
        })
      }
    } else if (cb.block_type === "flashcards") {
      blocks.push({
        subject_id: cb.subject_id,
        subject_name: subjectName,
        type: "flashcards",
        count: Number(cb.params.question_count ?? 10),
        minutes: Number(cb.params.minutes ?? 15),
        label: cb.label || `Flashcards — ${subjectName}`,
        params: {
          block_key: blockKey,
          content_node_id: cb.content_node_id,
          cycle_block: true,
        },
      })
    } else if (cb.block_type === "error_review") {
      blocks.push({
        subject_id: cb.subject_id,
        subject_name: subjectName,
        type: "error_review",
        count: Number(cb.params.question_count ?? 5),
        minutes: Number(cb.params.minutes ?? 20),
        label: cb.label || `Revisão de erros — ${subjectName}`,
        params: {
          block_key: blockKey,
          subject_id: cb.subject_id,
          content_node_id: cb.content_node_id,
          cycle_block: true,
        },
      })
    } else if (cb.block_type === "read") {
      blocks.push({
        subject_id: cb.subject_id,
        subject_name: subjectName,
        type: "read_material",
        count: 1,
        minutes: Number(cb.params.minutes ?? 30),
        label: cb.label || `Leitura — ${subjectName}`,
        params: {
          block_key: blockKey,
          content_node_id: cb.content_node_id,
          cycle_block: true,
        },
      })
    }
  }

  return blocks
}

export async function resolveCombinedNotebookForCycleBlocks(
  userId: string,
  cycleBlocks: DailyStudyBlock[],
  primarySubjectId: string,
  today: string
): Promise<string | null> {
  const allIds = cycleBlocks
    .filter((b) => b.type === "questions")
    .flatMap((b) => (b.params.question_ids as string[]) ?? [])

  if (!allIds.length) return null

  const { createNotebookFromQuestionIds } = await import("./notebook-from-performance")
  const labels = cycleBlocks
    .filter((b) => b.type === "questions")
    .map((b) => b.label)
    .slice(0, 3)

  return createNotebookFromQuestionIds(
    userId,
    `Ciclo ${today}${labels.length ? ` — ${labels.join(", ")}` : ""}`.slice(0, 120),
    primarySubjectId,
    allIds,
    null,
    false
  )
}
