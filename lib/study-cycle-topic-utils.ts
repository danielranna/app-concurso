import type { TecSubjectNode, TecSubjectTreeResponse } from "./tec-subject-tree-types"
import type { StudyCycleContentBlockTopic } from "./study-cycle-types"

export type TecTopicRef = { tec_subject: string; tec_topic: string }

export type TopicSubjectGroup = {
  tec_subject: string
  topics: StudyCycleContentBlockTopic[]
}

export type AssignedTopicTreeNode =
  | {
      kind: "folder"
      name: string
      children: AssignedTopicTreeNode[]
      count: number
    }
  | {
      kind: "topic"
      topic: StudyCycleContentBlockTopic
      name: string
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

function countTopicLeaves(nodes: AssignedTopicTreeNode[]): number {
  return nodes.reduce(
    (n, node) =>
      n + (node.kind === "topic" ? 1 : countTopicLeaves(node.children)),
    0
  )
}

function pruneNodesToAssigned(
  nodes: TecSubjectNode[],
  assigned: Set<string>,
  topicByKey: Map<string, StudyCycleContentBlockTopic>,
  placed: Set<string>
): AssignedTopicTreeNode[] {
  const out: AssignedTopicTreeNode[] = []

  for (const node of nodes) {
    if (node.node_type === "topic") {
      const topicName = (node.tec_topic ?? node.name ?? "").trim()
      if (!topicName) continue
      const key = topicKey({
        tec_subject: node.tec_subject,
        tec_topic: topicName,
      })
      if (!assigned.has(key)) continue
      const topic = topicByKey.get(key)
      if (!topic) continue
      placed.add(key)
      out.push({
        kind: "topic",
        topic,
        name: topic.tec_topic || topicName,
      })
    } else {
      const children = pruneNodesToAssigned(
        node.children ?? [],
        assigned,
        topicByKey,
        placed
      )
      if (children.length > 0) {
        out.push({
          kind: "folder",
          name: node.name,
          children,
          count: countTopicLeaves(children),
        })
      }
    }
  }

  return out
}

/** Monta árvore de pastas/assuntos só com o que está no bloco, espelhando o banco TEC. */
export function buildAssignedTopicTree(
  topics: StudyCycleContentBlockTopic[],
  trees: TecSubjectTreeResponse[]
): AssignedTopicTreeNode[] {
  if (!topics.length) return []

  const assigned = new Set(topics.map((t) => topicKey(t)))
  const topicByKey = new Map(topics.map((t) => [topicKey(t), t]))
  const placed = new Set<string>()
  const result: AssignedTopicTreeNode[] = []

  for (const tree of trees) {
    const roots = [...tree.nodes, ...tree.ungrouped]
    const pruned = pruneNodesToAssigned(roots, assigned, topicByKey, placed)
    if (!pruned.length) continue

    if (trees.length > 1) {
      result.push({
        kind: "folder",
        name: tree.tec_subject,
        children: pruned,
        count: countTopicLeaves(pruned),
      })
    } else {
      result.push(...pruned)
    }
  }

  const orphan = topics.filter((t) => !placed.has(topicKey(t)))
  if (orphan.length > 0) {
    const bySubject = groupTopicsBySubject(orphan)
    for (const group of bySubject) {
      result.push({
        kind: "folder",
        name: group.tec_subject,
        children: group.topics.map((topic) => ({
          kind: "topic" as const,
          topic,
          name: topic.tec_topic || topic.tec_subject,
        })),
        count: group.topics.length,
      })
    }
  }

  return result
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
