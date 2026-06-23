"use client"

import type { PriorityBreakdownRow } from "@/lib/ai/priority-breakdown"
import PriorityRankingPanel, {
  type BrainTopicHint,
  type PriorityPanelVariant,
} from "./PriorityRankingPanel"

export type QueueItem = {
  id?: string
  topic_key: string
  topic_label?: string
  priority_score: number
  incidence_weight?: number
  edital_weight?: number
  gap_score?: number
  retention_penalty?: number
  reason?: string | null
  dominio?: number
  wrong_count?: number
  brain_status?: string
  attempts?: number
}

export type { BrainTopicHint }

function queueToBreakdownRows(items: QueueItem[]): PriorityBreakdownRow[] {
  return items.map((item, idx) => ({
    topic_key: item.topic_key,
    topic_label: item.topic_label ?? item.topic_key,
    score: item.priority_score,
    edital_weight: item.edital_weight ?? 1,
    incidence_weight: item.incidence_weight ?? 1,
    edital_incidence_score:
      (item.edital_weight ?? 1) * (item.incidence_weight ?? 1),
    attempts: item.attempts ?? 1,
    wrong_count: item.wrong_count ?? 0,
    dominio: item.dominio,
    brain_status: item.brain_status,
    gap_score: item.gap_score,
    retention_penalty: item.retention_penalty,
    reason: item.reason ?? undefined,
    rank: idx + 1,
  }))
}

export default function StrategicQueueList({
  items,
  loading,
  emptyMessage = "Nenhum tópico na fila. Conclua cadernos ou recalcule a fila.",
  collapseAfter = 5,
  brainByTopic,
  variant = "crossed",
}: {
  items: QueueItem[]
  loading?: boolean
  emptyMessage?: string
  collapseAfter?: number
  brainByTopic?: Record<string, BrainTopicHint>
  variant?: PriorityPanelVariant
}) {
  return (
    <PriorityRankingPanel
      title=""
      items={queueToBreakdownRows(items)}
      loading={loading}
      variant={variant}
      emptyMessage={emptyMessage}
      collapseAfter={collapseAfter}
      brainByTopic={brainByTopic}
      bare
    />
  )
}
