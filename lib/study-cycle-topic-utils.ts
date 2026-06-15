import type { TecSubjectNode } from "./tec-subject-tree-types"

export type TecTopicRef = { tec_subject: string; tec_topic: string }

export function topicKey(t: TecTopicRef): string {
  return `${t.tec_subject}\0${t.tec_topic}`
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
