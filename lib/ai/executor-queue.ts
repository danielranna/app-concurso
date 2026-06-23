import { supabaseServer } from "../supabase-server"
import type { PrioritySource } from "../priority-source"
import { recomputeStrategicQueue } from "./strategic-queue"
import type { QueueRow } from "./execution-questions"
import type { PlanGenerationStep } from "../coach-types"

export function buildQueueBySubject(rows: QueueRow[]): Map<string, QueueRow[]> {
  const queueBySubject = new Map<string, QueueRow[]>()
  for (const item of rows) {
    const list = queueBySubject.get(item.subject_id) ?? []
    list.push(item)
    queueBySubject.set(item.subject_id, list)
  }
  for (const [, list] of queueBySubject) {
    list.sort((a, b) => Number(b.priority_score) - Number(a.priority_score))
  }
  return queueBySubject
}

export async function loadExecutorQueueForSubjects(
  userId: string,
  subjectIds: string[],
  prioritySource: PrioritySource
): Promise<QueueRow[]> {
  if (!subjectIds.length) return []

  const { data, error } = await supabaseServer
    .from("strategic_queue_items")
    .select(
      "subject_id, topic_key, topic_label, priority_score, reason, priority_source"
    )
    .eq("user_id", userId)
    .eq("priority_source", prioritySource)
    .in("subject_id", subjectIds)
    .order("priority_score", { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    subject_id: row.subject_id as string,
    topic_key: row.topic_key as string,
    topic_label: (row.topic_label as string) ?? undefined,
    priority_score: Number(row.priority_score),
    reason: (row.reason as string) ?? null,
  }))
}

export async function ensureQueuesForExecutorSubjects(
  userId: string,
  subjectIds: string[],
  prioritySource: PrioritySource,
  queueBySubject: Map<string, QueueRow[]>,
  options?: {
    onProgress?: (step: PlanGenerationStep) => void
    subjectNames?: Map<string, string>
  }
): Promise<{ queue: QueueRow[]; queueBySubject: Map<string, QueueRow[]> }> {
  const missing = subjectIds.filter((id) => !(queueBySubject.get(id)?.length ?? 0))

  for (const subjectId of missing) {
    const name = options?.subjectNames?.get(subjectId) ?? subjectId
    options?.onProgress?.({
      phase: "queue_loaded",
      message: `Recalculando fila para ${name}…`,
      detail: { subject_id: subjectId, subject_name: name },
    })
    await recomputeStrategicQueue(userId, subjectId, {
      withLlmNarrative: false,
      autoLlm: false,
    })
  }

  if (!missing.length) {
    const queue = [...queueBySubject.values()].flat()
    return { queue, queueBySubject }
  }

  const queue = await loadExecutorQueueForSubjects(
    userId,
    subjectIds,
    prioritySource
  )
  return { queue, queueBySubject: buildQueueBySubject(queue) }
}
