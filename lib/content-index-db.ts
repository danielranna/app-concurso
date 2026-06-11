import { supabaseServer } from "./supabase-server"
import type {
  ContentNodeBancaIncidence,
  ContentTreeResponse,
  SubjectContentNode,
} from "./content-index-types"

type NodeRow = {
  id: string
  user_id: string
  subject_id: string
  parent_id: string | null
  node_type: string
  name: string
  tec_subject: string | null
  tec_topic: string | null
  notebook_id: string | null
  sort_order: number
  question_count: number
  synced_at: string | null
}

function rowToNode(
  row: NodeRow,
  incidence: ContentNodeBancaIncidence[] = []
): SubjectContentNode {
  return {
    id: row.id,
    user_id: row.user_id,
    subject_id: row.subject_id,
    parent_id: row.parent_id,
    node_type: row.node_type as SubjectContentNode["node_type"],
    name: row.name,
    tec_subject: row.tec_subject,
    tec_topic: row.tec_topic,
    notebook_id: row.notebook_id,
    sort_order: row.sort_order,
    question_count: row.question_count,
    synced_at: row.synced_at,
    incidence,
  }
}

function buildTree(flat: SubjectContentNode[]): SubjectContentNode[] {
  const byId = new Map(flat.map((n) => [n.id, { ...n, children: [] as SubjectContentNode[] }]))
  const roots: SubjectContentNode[] = []

  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children!.push(node)
    } else {
      roots.push(node)
    }
  }

  function sortRec(list: SubjectContentNode[]) {
    list.sort((a, b) => a.sort_order - b.sort_order)
    for (const n of list) {
      if (n.children?.length) sortRec(n.children)
    }
  }
  sortRec(roots)
  return roots
}

export async function fetchContentTree(
  userId: string,
  subjectId: string
): Promise<ContentTreeResponse> {
  const { data: rows, error } = await supabaseServer
    .from("subject_content_nodes")
    .select("*")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .order("sort_order")

  if (error) throw new Error(error.message)

  const nodeIds = (rows ?? []).map((r) => r.id)
  let incidenceMap = new Map<string, ContentNodeBancaIncidence[]>()

  if (nodeIds.length) {
    const { data: incRows } = await supabaseServer
      .from("content_node_banca_incidence")
      .select("id, node_id, banca, percent, notes")
      .in("node_id", nodeIds)

    for (const inc of incRows ?? []) {
      const list = incidenceMap.get(inc.node_id) ?? []
      list.push({
        id: inc.id,
        banca: inc.banca,
        percent: Number(inc.percent),
        notes: inc.notes,
      })
      incidenceMap.set(inc.node_id, list)
    }
  }

  const flat = (rows ?? []).map((r) =>
    rowToNode(r as NodeRow, incidenceMap.get(r.id) ?? [])
  )

  const grouped = flat.filter((n) => n.parent_id !== null || n.node_type === "group")
  const ungrouped = flat.filter(
    (n) => n.parent_id === null && n.node_type === "topic"
  )

  const treeNodes = flat.filter(
    (n) => n.node_type === "group" || (n.parent_id !== null && n.node_type === "topic")
  )

  return {
    subject_id: subjectId,
    nodes: buildTree(treeNodes.length ? treeNodes : grouped.filter((n) => n.node_type === "group")),
    ungrouped,
  }
}

export async function createContentGroup(
  userId: string,
  subjectId: string,
  name: string,
  parentId: string | null
): Promise<SubjectContentNode> {
  const { data: maxSort } = await supabaseServer
    .from("subject_content_nodes")
    .select("sort_order")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .eq("parent_id", parentId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabaseServer
    .from("subject_content_nodes")
    .insert({
      user_id: userId,
      subject_id: subjectId,
      parent_id: parentId,
      node_type: "group",
      name,
      sort_order: (maxSort?.sort_order ?? -1) + 1,
    })
    .select("*")
    .single()

  if (error) throw new Error(error.message)
  return rowToNode(data as NodeRow)
}

export async function updateContentNode(
  userId: string,
  nodeId: string,
  patch: {
    name?: string
    parent_id?: string | null
    sort_order?: number
    notebook_id?: string | null
  }
): Promise<void> {
  const { error } = await supabaseServer
    .from("subject_content_nodes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", nodeId)
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
}

export async function deleteContentNode(
  userId: string,
  nodeId: string
): Promise<void> {
  const { data: node } = await supabaseServer
    .from("subject_content_nodes")
    .select("node_type")
    .eq("id", nodeId)
    .eq("user_id", userId)
    .single()

  if (!node) throw new Error("Nó não encontrado")

  if (node.node_type === "group") {
    await supabaseServer
      .from("subject_content_nodes")
      .update({ parent_id: null })
      .eq("parent_id", nodeId)
  }

  const { error } = await supabaseServer
    .from("subject_content_nodes")
    .delete()
    .eq("id", nodeId)
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
}

export async function upsertNodeIncidence(
  userId: string,
  nodeId: string,
  banca: string,
  percent: number,
  notes?: string
): Promise<void> {
  const { error } = await supabaseServer.from("content_node_banca_incidence").upsert(
    {
      user_id: userId,
      node_id: nodeId,
      banca: banca.trim(),
      percent,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "node_id,banca" }
  )
  if (error) throw new Error(error.message)
}

export async function deleteNodeIncidence(
  userId: string,
  incidenceId: string
): Promise<void> {
  const { error } = await supabaseServer
    .from("content_node_banca_incidence")
    .delete()
    .eq("id", incidenceId)
    .eq("user_id", userId)
  if (error) throw new Error(error.message)
}

export async function getContentNode(
  userId: string,
  nodeId: string
): Promise<SubjectContentNode | null> {
  const { data } = await supabaseServer
    .from("subject_content_nodes")
    .select("*")
    .eq("id", nodeId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!data) return null

  const { data: incRows } = await supabaseServer
    .from("content_node_banca_incidence")
    .select("id, banca, percent, notes")
    .eq("node_id", nodeId)

  return rowToNode(
    data as NodeRow,
    (incRows ?? []).map((i) => ({
      id: i.id,
      banca: i.banca,
      percent: Number(i.percent),
      notes: i.notes,
    }))
  )
}

export async function listContentNodesFlat(
  userId: string,
  subjectId: string
): Promise<SubjectContentNode[]> {
  const { data: rows } = await supabaseServer
    .from("subject_content_nodes")
    .select("*")
    .eq("user_id", userId)
    .eq("subject_id", subjectId)
    .order("sort_order")

  return (rows ?? []).map((r) => rowToNode(r as NodeRow))
}
