import {
  sortFoldersByDepth,
  type ApplyIndexFolderInput,
  type ApplyIndexMatchInput,
  type DbTopicCandidate,
} from "./tec-notebook-index-import"
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
  let walkId: string | null = nodeId
  while (walkId) {
    if (walkId === ancestorId) return true
    const { data: row }: { data: { parent_id: string | null } | null } =
      await supabaseServer
        .from("tec_subject_nodes")
        .select("parent_id")
        .eq("id", walkId)
        .eq("user_id", userId)
        .maybeSingle()
    walkId = row?.parent_id ?? null
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

export async function bulkMoveTecSubjectNodes(
  userId: string,
  nodeIds: string[],
  parentId: string | null
): Promise<{ moved: number; skipped: number }> {
  const unique = [...new Set(nodeIds)]
  const valid: string[] = []

  for (const nodeId of unique) {
    if (parentId === nodeId) continue
    if (parentId && (await isNodeUnderAncestor(userId, nodeId, parentId))) continue
    valid.push(nodeId)
  }

  if (valid.length === 0) {
    return { moved: 0, skipped: unique.length }
  }

  const { error } = await supabaseServer
    .from("tec_subject_nodes")
    .update({ parent_id: parentId, updated_at: new Date().toISOString() })
    .in("id", valid)
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
  return { moved: valid.length, skipped: unique.length - valid.length }
}

export async function listTecTopicNodesForSubject(
  userId: string,
  tecSubject: string,
  options?: { ungroupedOnly?: boolean }
): Promise<DbTopicCandidate[]> {
  const { data, error } = await supabaseServer
    .from("tec_subject_nodes")
    .select("id, name, tec_topic, question_count, parent_id")
    .eq("user_id", userId)
    .eq("tec_subject", tecSubject)
    .eq("node_type", "topic")

  if (error) throw new Error(error.message)

  const rows = options?.ungroupedOnly
    ? (data ?? []).filter((row) => row.parent_id == null)
    : (data ?? [])

  return rows.map((row) => ({
    id: row.id as string,
    tec_topic: (row.tec_topic as string | null) ?? (row.name as string),
    name: row.name as string,
    question_count: (row.question_count as number) ?? 0,
  }))
}

async function findExistingTecFolder(
  userId: string,
  tecSubject: string,
  name: string,
  parentId: string | null
): Promise<TecSubjectNode | null> {
  let query = supabaseServer
    .from("tec_subject_nodes")
    .select("*")
    .eq("user_id", userId)
    .eq("tec_subject", tecSubject)
    .eq("node_type", "folder")
    .eq("name", name)

  if (parentId) query = query.eq("parent_id", parentId)
  else query = query.is("parent_id", null)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return rowToNode(data as NodeRow)
}

export async function applyNotebookIndexHierarchy(
  userId: string,
  tecSubject: string,
  folders: ApplyIndexFolderInput[],
  matches: ApplyIndexMatchInput[]
): Promise<{
  folders_created: number
  folders_reused: number
  topics_moved: number
  topics_skipped_placed: number
}> {
  const pathToFolderId = new Map<string, string>()
  let folders_created = 0
  let folders_reused = 0
  let topics_moved = 0

  for (const folder of sortFoldersByDepth(folders)) {
    const parentId = folder.parent_path
      ? (pathToFolderId.get(folder.parent_path) ?? null)
      : null

    const existing = await findExistingTecFolder(
      userId,
      tecSubject,
      folder.name,
      parentId
    )

    if (existing) {
      pathToFolderId.set(folder.path, existing.id)
      folders_reused++
    } else {
      const created = await createTecFolder(userId, tecSubject, folder.name, parentId)
      pathToFolderId.set(folder.path, created.id)
      folders_created++
    }
  }

  const matchIds = matches.map((m) => m.db_node_id)
  let activeMatches = matches
  let topics_skipped_placed = 0

  if (matchIds.length > 0) {
    const { data: placedRows, error: placedErr } = await supabaseServer
      .from("tec_subject_nodes")
      .select("id, parent_id")
      .eq("user_id", userId)
      .in("id", matchIds)

    if (placedErr) throw new Error(placedErr.message)

    const placedIds = new Set(
      (placedRows ?? [])
        .filter((row) => row.parent_id != null)
        .map((row) => row.id as string)
    )
    activeMatches = matches.filter((m) => !placedIds.has(m.db_node_id))
    topics_skipped_placed = matches.length - activeMatches.length
  }

  const byParentId = new Map<string | null, string[]>()
  for (const match of activeMatches) {
    const parentId = match.parent_path
      ? (pathToFolderId.get(match.parent_path) ?? null)
      : null
    const list = byParentId.get(parentId) ?? []
    list.push(match.db_node_id)
    byParentId.set(parentId, list)
  }

  for (const [parentId, nodeIds] of byParentId) {
    const result = await bulkMoveTecSubjectNodes(userId, nodeIds, parentId)
    topics_moved += result.moved
  }

  return { folders_created, folders_reused, topics_moved, topics_skipped_placed }
}

export async function deleteTopicNodesAndBankQuestions(
  userId: string,
  tecSubject: string,
  nodeIds: string[]
): Promise<{
  nodes_deleted: number
  questions_deleted: number
  skipped_folder_ids: string[]
}> {
  const unique = [...new Set(nodeIds)]
  if (unique.length === 0) {
    return { nodes_deleted: 0, questions_deleted: 0, skipped_folder_ids: [] }
  }

  const { data: nodes, error } = await supabaseServer
    .from("tec_subject_nodes")
    .select("id, node_type, tec_topic, name")
    .eq("user_id", userId)
    .eq("tec_subject", tecSubject)
    .in("id", unique)

  if (error) throw new Error(error.message)

  const skipped_folder_ids: string[] = []
  let nodes_deleted = 0
  let questions_deleted = 0

  for (const node of nodes ?? []) {
    if (node.node_type !== "topic") {
      skipped_folder_ids.push(node.id as string)
      continue
    }

    const tecTopic = ((node.tec_topic as string | null) ?? (node.name as string)).trim()
    if (tecTopic) {
      const { data: qrows, error: qErr } = await supabaseServer
        .from("questions")
        .select("id")
        .eq("tec_subject", tecSubject)
        .eq("tec_topic", tecTopic)

      if (qErr) throw new Error(qErr.message)

      const questionIds = (qrows ?? []).map((r) => r.id as string)
      if (questionIds.length > 0) {
        const { error: delErr } = await supabaseServer
          .from("questions")
          .delete()
          .in("id", questionIds)
        if (delErr) throw new Error(delErr.message)
        questions_deleted += questionIds.length
      }
    }

    await deleteTecSubjectNode(userId, node.id as string)
    nodes_deleted++
  }

  return { nodes_deleted, questions_deleted, skipped_folder_ids }
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
