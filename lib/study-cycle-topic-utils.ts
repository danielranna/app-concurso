import type { TecSubjectNode } from "./tec-subject-tree-types"
import type { StudyCycleContentBlockTopic } from "./study-cycle-types"

export type TecTopicRef = { tec_subject: string; tec_topic: string }

export type TopicSubjectGroup = {
  tec_subject: string
  topics: StudyCycleContentBlockTopic[]
}

export function topicKey(t: TecTopicRef): string {
  return `${t.tec_subject}\0${t.tec_topic}`
}

export function groupTopicsBySubject(
  topics: StudyCycleContentBlockTopic[]
): TopicSubjectGroup[] {
  const map = new Map<string, StudyCycleContentBlockTopic[]>()
  for (const t of topics) {
    const key = t.tec_subject?.trim() || "Outros"
    const list = map.get(key) ?? []
    list.push(t)
    map.set(key, list)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([tec_subject, items]) => ({
      tec_subject,
      topics: [...items].sort((a, b) =>
        (a.tec_topic || a.tec_subject).localeCompare(
          b.tec_topic || b.tec_subject,
          "pt-BR"
        )
      ),
    }))
}

export function flattenFolderTopics(node: TecSubjectNode): TecTopicRef[] {
  if (node.node_type === "topic") {
    const topic = (node.tec_topic ?? node.name ?? "").trim()
    if (!topic) return []
    return [{ tec_subject: node.tec_subject, tec_topic: topic }]
  }
  const children = node.children ?? []
  return children.flatMap((c) => flattenFolderTopics(c))
}
