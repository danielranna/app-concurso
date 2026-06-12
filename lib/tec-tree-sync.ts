import type {
  TecSubjectNode,
  TecSubjectTreeResponse,
} from "./tec-subject-tree-types"

export type OrphanTecTopics = {
  tec_subject: string
  topics: string[]
}

const UNCLASSIFIED_TOPIC = "(sem assunto classificado)"

export function collectTecTopicsFromTree(tree: TecSubjectTreeResponse): Set<string> {
  const out = new Set<string>()
  function walk(nodes: TecSubjectNode[]) {
    for (const n of nodes) {
      if (n.node_type === "topic" && n.tec_topic) out.add(n.tec_topic)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(tree.nodes)
  for (const u of tree.ungrouped) {
    if (u.tec_topic) out.add(u.tec_topic)
  }
  return out
}

export function computeOrphanTecTopics(
  tecTrees: TecSubjectTreeResponse[],
  tecGroups: { tec_subject: string; topics: string[] }[]
): OrphanTecTopics[] {
  const treeBySubject = new Map(tecTrees.map((t) => [t.tec_subject, t]))
  const out: OrphanTecTopics[] = []

  for (const group of tecGroups) {
    const tree = treeBySubject.get(group.tec_subject)
    if (!tree) continue
    const inTree = collectTecTopicsFromTree(tree)
    const orphans = group.topics.filter(
      (t) => t !== UNCLASSIFIED_TOPIC && !inTree.has(t)
    )
    if (orphans.length > 0) {
      out.push({ tec_subject: group.tec_subject, topics: orphans })
    }
  }

  return out
}
