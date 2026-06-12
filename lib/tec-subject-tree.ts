import { supabaseServer } from "./supabase-server"
import type {
  TecSubjectNode,
  TecSubjectSummary,
  TecSubjectTreeResponse,
} from "./tec-subject-tree-types"

type NodeRow = {
  id: string
  user_id: string
  tec_subject: string
  parent_id: string | null
  node_type: string
  name: string
  tec_topic: string | null
  sort_order: number
  question_count: number
}

function rowToNode(row: NodeRow): TecSubjectNode {
  return {
    id: row.id,
    user_id: row.user_id,
    tec_subject: row.tec_subject,
    parent_id: row.parent_id,
    node_type: row.node_type as TecSubjectNode["node_type"],
    name: row.name,
    tec_topic: row.tec_topic,
    sort_order: row.sort_order,
    question_count: row.question_count,
  }
}

function buildTree(flat: TecSubjectNode[]): TecSubjectNode[] {
  const byId = new Map(flat.map((n) => [n.id, { ...n, children: [] as TecSubjectNode[] }]))
  const roots: TecSubjectNode[] = []

  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children!.push(node)
    } else {
      roots.push(node)
    }
  }

  function sortRec(list: TecSubjectNode[]) {
    list.sort((a, b) => a.sort_order - b.sort_order)
    for (const n of list) {
      if (n.children?.length) sortRec(n.children)
    }
  }
  sortRec(roots)
  return roots
}

function rollupCounts(nodes: TecSubjectNode[], total: number): void {
  function walk(n: TecSubjectNode): number {
    let count = n.node_type === "topic" ? n.question_count : 0
    for (const c of n.children ?? []) {
      count += walk(c)
    }
    n.question_count = count
    n.percent = total > 0 ? (count / total) * 100 : 0
    return count
  }
  for (const n of nodes) walk(n)
}

async function countQuestionsForSubject(tecSubject: string): Promise<number> {
  const { count } = await supabaseServer
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("tec_subject", tecSubject)
  return count ?? 0
}

async function countQuestionsForTopic(
  tecSubject: string,
  tecTopic: string
): Promise<number> {
  const { count } = await supabaseServer
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("tec_subject", tecSubject)
    .eq("tec_topic", tecTopic)
  return count ?? 0
}

export async function listTecSubjectSummaries(
  userId: string
): Promise<TecSubjectSummary[]> {
  const { data: qRows } = await supabaseServer
    .from("questions")
    .select("tec_subject, tec_topic")

  const bySubject = new Map<string, { topics: Set<string>; count: number }>()
  for (const r of qRows ?? []) {
    const sub = r.tec_subject?.trim()
    if (!sub) continue
    const g = bySubject.get(sub) ?? { topics: new Set<string>(), count: 0 }
    g.count++
    if (r.tec_topic?.trim()) g.topics.add(r.tec_topic.trim())
    bySubject.set(sub, g)
  }

  const { data: treeRows } = await supabaseServer
    .from("tec_subject_nodes")
    .select("tec_subject")
    .eq("user_id", userId)

  const hasTree = new Set((treeRows ?? []).map((r) => r.tec_subject))

  return [...bySubject.entries()]
    .map(([tec_subject, g]) => ({
      tec_subject,
      topic_count: g.topics.size,
      total_questions: g.count,
      has_tree: hasTree.has(tec_subject),
    }))
    .sort((a, b) => a.tec_subject.localeCompare(b.tec_subject, "pt-BR"))
}

export async function fetchTecSubjectTree(
  userId: string,
  tecSubject: string
): Promise<TecSubjectTreeResponse> {
  const { data: rows, error } = await supabaseServer
    .from("tec_subject_nodes")
    .select("*")
    .eq("user_id", userId)
    .eq("tec_subject", tecSubject)
    .order("sort_order")

  if (error) throw new Error(error.message)

  const flat = (rows ?? []).map((r) => rowToNode(r as NodeRow))
  const total = await countQuestionsForSubject(tecSubject)

  const grouped = flat.filter((n) => n.parent_id !== null || n.node_type === "folder")
  const ungrouped = flat.filter(
    (n) => n.parent_id === null && n.node_type === "topic"
  )

  const treeNodes = flat.filter(
    (n) => n.node_type === "folder" || (n.parent_id !== null && n.node_type === "topic")
  )

  const nodes = buildTree(
    treeNodes.length ? treeNodes : grouped.filter((n) => n.node_type === "folder")
  )
  rollupCounts(nodes, total)
  for (const u of ungrouped) {
    u.percent = total > 0 ? (u.question_count / total) * 100 : 0
  }

  return {
    tec_subject: tecSubject,
    nodes,
    ungrouped,
    total_questions: total,
  }
}

export async function seedTecSubjectTopicsFromBank(
  userId: string,
  tecSubject: string
): Promise<{ created: number; skipped: number }> {
  const { data: qRows } = await supabaseServer
    .from("questions")
    .select("tec_topic")
    .eq("tec_subject", tecSubject)

  const topics = new Set<string>()
  for (const r of qRows ?? []) {
    const t = r.tec_topic?.trim()
    if (t) topics.add(t)
  }

  const { data: existing } = await supabaseServer
    .from("tec_subject_nodes")
    .select("tec_topic")
    .eq("user_id", userId)
    .eq("tec_subject", tecSubject)
    .eq("node_type", "topic")

  const existingTopics = new Set(
    (existing ?? []).map((r) => r.tec_topic).filter(Boolean) as string[]
  )

  let created = 0
  let skipped = 0
  let sort = 0

  for (const topic of [...topics].sort((a, b) => a.localeCompare(b, "pt-BR"))) {
    if (existingTopics.has(topic)) {
      skipped++
      continue
    }
    const count = await countQuestionsForTopic(tecSubject, topic)
    const { error } = await supabaseServer.from("tec_subject_nodes").insert({
      user_id: userId,
      tec_subject: tecSubject,
      parent_id: null,
      node_type: "topic",
      name: topic,
      tec_topic: topic,
      sort_order: sort++,
      question_count: count,
    })
    if (error) throw new Error(error.message)
    created++
  }

  return { created, skipped }
}

export async function createTecFolder(
  userId: string,
  tecSubject: string,
  name: string,
  parentId: string | null
): Promise<TecSubjectNode> {
  const { data: maxSort } = await supabaseServer
    .from("tec_subject_nodes")
    .select("sort_order")
    .eq("user_id", userId)
    .eq("tec_subject", tecSubject)
    .eq("parent_id", parentId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabaseServer
    .from("tec_subject_nodes")
    .insert({
      user_id: userId,
      tec_subject: tecSubject,
      parent_id: parentId,
      node_type: "folder",
      name,
      sort_order: (maxSort?.sort_order ?? -1) + 1,
      question_count: 0,
    })
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return rowToNode(data as NodeRow)
}

async function isNodeUnderAncestor(
  userId: string,
  ancestorId: string,
  nodeId: string
): Promise<boolean> {
  let current: string | null = nodeId
  while (current) {
    if (current === ancestorId) return true
    const { data } = await supabaseServer
      .from("tec_subject_nodes")
      .select("parent_id")
      .eq("id", current)
      .eq("user_id", userId)
      .maybeSingle()
    current = (data?.parent_id as string | null) ?? null
  }
  return false
}

export async function updateTecSubjectNode(
  userId: string,
  nodeId: string,
  patch: { name?: string; parent_id?: string | null; sort_order?: number }
): Promise<void> {
  if (patch.parent_id !== undefined) {
    if (patch.parent_id === nodeId) {
      throw new Error("Não é possível mover um item para dentro de si mesmo")
    }
    if (patch.parent_id) {
      const nested = await isNodeUnderAncestor(userId, nodeId, patch.parent_id)
      if (nested) {
        throw new Error("Não é possível mover uma pasta para dentro de uma subpasta dela")
      }
    }
  }

  const { error } = await supabaseServer
    .from("tec_subject_nodes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", nodeId)
    .eq("user_id", userId)
  if (error) throw new Error(error.message)
}

export async function deleteTecSubjectNode(
  userId: string,
  nodeId: string
): Promise<void> {
  const { data: node } = await supabaseServer
    .from("tec_subject_nodes")
    .select("node_type")
    .eq("id", nodeId)
    .eq("user_id", userId)
    .single()

  if (!node) throw new Error("Nó não encontrado")

  if (node.node_type === "folder") {
    await supabaseServer
      .from("tec_subject_nodes")
      .update({ parent_id: null })
      .eq("parent_id", nodeId)
  }

  const { error } = await supabaseServer
    .from("tec_subject_nodes")
    .delete()
    .eq("id", nodeId)
    .eq("user_id", userId)
  if (error) throw new Error(error.message)
}

export async function mirrorTecTreeToContentIndex(
  userId: string,
  tecSubject: string,
  subjectId: string
): Promise<{ folders: number; topics: number }> {
  const tree = await fetchTecSubjectTree(userId, tecSubject)
  let folders = 0
  let topics = 0

  async function ensureGroup(node: TecSubjectNode, parentId: string | null) {
    const { data: existing } = await supabaseServer
      .from("subject_content_nodes")
      .select("id")
      .eq("user_id", userId)
      .eq("subject_id", subjectId)
      .eq("node_type", "group")
      .eq("name", node.name)
      .eq("parent_id", parentId)
      .maybeSingle()

    if (existing) {
      return existing.id
    }

    const { data: maxSort } = await supabaseServer
      .from("subject_content_nodes")
      .select("sort_order")
      .eq("user_id", userId)
      .eq("subject_id", subjectId)
      .eq("parent_id", parentId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: created, error } = await supabaseServer
      .from("subject_content_nodes")
      .insert({
        user_id: userId,
        subject_id: subjectId,
        parent_id: parentId,
        node_type: "group",
        name: node.name,
        sort_order: (maxSort?.sort_order ?? -1) + 1,
        question_count: node.question_count,
      })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    folders++
    return created!.id
  }

  async function ensureTopic(node: TecSubjectNode, parentId: string | null) {
    if (!node.tec_topic) return
    const { data: existing } = await supabaseServer
      .from("subject_content_nodes")
      .select("id")
      .eq("user_id", userId)
      .eq("subject_id", subjectId)
      .eq("node_type", "topic")
      .eq("tec_subject", tecSubject)
      .eq("tec_topic", node.tec_topic)
      .maybeSingle()

    if (existing) {
      await supabaseServer
        .from("subject_content_nodes")
        .update({
          parent_id: parentId,
          name: node.name,
          question_count: node.question_count,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
      return
    }

    const { data: maxSort } = await supabaseServer
      .from("subject_content_nodes")
      .select("sort_order")
      .eq("user_id", userId)
      .eq("subject_id", subjectId)
      .eq("parent_id", parentId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()

    const { error } = await supabaseServer.from("subject_content_nodes").insert({
      user_id: userId,
      subject_id: subjectId,
      parent_id: parentId,
      node_type: "topic",
      name: node.name,
      tec_subject: tecSubject,
      tec_topic: node.tec_topic,
      sort_order: (maxSort?.sort_order ?? -1) + 1,
      question_count: node.question_count,
    })
    if (error) throw new Error(error.message)
    topics++
  }

  async function mirrorNodes(nodes: TecSubjectNode[], parentContentId: string | null) {
    for (const n of nodes) {
      if (n.node_type === "folder") {
        const gid = await ensureGroup(n, parentContentId)
        if (n.children?.length) await mirrorNodes(n.children, gid)
      } else {
        await ensureTopic(n, parentContentId)
      }
    }
  }

  await mirrorNodes(tree.nodes, null)
  for (const u of tree.ungrouped) {
    await ensureTopic(u, null)
  }

  return { folders, topics }
}

export async function fetchTecTreeFacetsForBank(
  userId: string,
  tecSubject?: string
): Promise<TecSubjectTreeResponse[]> {
  let subjects: string[] = []
  if (tecSubject) {
    subjects = [tecSubject]
  } else {
    const summaries = await listTecSubjectSummaries(userId)
    subjects = summaries.filter((s) => s.has_tree).map((s) => s.tec_subject)
  }

  const out: TecSubjectTreeResponse[] = []
  for (const sub of subjects) {
    const tree = await fetchTecSubjectTree(userId, sub)
    if (tree.nodes.length || tree.ungrouped.length) out.push(tree)
  }
  return out
}
