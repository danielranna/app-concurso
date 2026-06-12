import { buildIncidenceTreeFromGroups } from "./incidence-hierarchy"
import type { IncidenceTreeNode } from "./incidence-hierarchy"
import { parseIncidenceXlsx } from "./incidence-xlsx"
import { matchScore, normLabel } from "./incidence-subject-map"

const AUTO_CONFIRM_SCORE = 75
const SUGGEST_SCORE = 60

export type ExcelIndexLeaf = {
  code: string
  name: string
  path: string
  parent_path: string | null
  quantity: number
  percent: number
}

export type ExcelIndexFolder = {
  code: string
  name: string
  path: string
  parent_path: string | null
  quantity: number
  percent: number
}

export type DbTopicCandidate = {
  id: string
  tec_topic: string
  name: string
  question_count: number
}

export type IndexMatchProposal = {
  excel_code: string
  excel_name: string
  excel_path: string
  parent_path: string | null
  db_node_id: string
  db_tec_topic: string
  score: number
  default_confirmed: boolean
}

export type NotebookIndexPreview = {
  excel_subject_label: string
  sheet_names: string[]
  folders: ExcelIndexFolder[]
  leaves: ExcelIndexLeaf[]
  matches: IndexMatchProposal[]
  unmatched_excel: ExcelIndexLeaf[]
  unmatched_db: DbTopicCandidate[]
  stats: {
    folder_count: number
    leaf_count: number
    matched_count: number
    suggested_count: number
    unmatched_excel_count: number
    unmatched_db_count: number
  }
}

export type ApplyIndexFolderInput = {
  path: string
  parent_path: string | null
  name: string
}

export type ApplyIndexMatchInput = {
  db_node_id: string
  parent_path: string | null
}

function pickSubjectBlock(
  blocks: { subject_label: string; groups: unknown[] }[],
  tecSubject: string
) {
  if (blocks.length === 0) return null
  if (blocks.length === 1) return blocks[0]

  let best = blocks[0]
  let bestScore = matchScore(blocks[0]!.subject_label, tecSubject)
  for (const block of blocks.slice(1)) {
    const score = matchScore(block.subject_label, tecSubject)
    if (score > bestScore) {
      best = block
      bestScore = score
    }
  }
  return best
}

function nodePath(parentPath: string | null, code: string): string {
  return parentPath ? `${parentPath}/${code}` : code
}

function flattenExcelTree(
  nodes: IncidenceTreeNode[],
  parentPath: string | null,
  folders: ExcelIndexFolder[],
  leaves: ExcelIndexLeaf[]
) {
  for (const n of nodes) {
    const path = nodePath(parentPath, n.code)
    const hasChildren = n.children.length > 0
    if (hasChildren) {
      folders.push({
        code: n.code,
        name: n.name,
        path,
        parent_path: parentPath,
        quantity: n.quantity,
        percent: n.percent,
      })
      flattenExcelTree(n.children, path, folders, leaves)
    } else {
      leaves.push({
        code: n.code,
        name: n.name,
        path,
        parent_path: parentPath,
        quantity: n.quantity,
        percent: n.percent,
      })
    }
  }
}

function matchLeavesToDbTopics(
  leaves: ExcelIndexLeaf[],
  dbTopics: DbTopicCandidate[]
): {
  matches: IndexMatchProposal[]
  unmatched_excel: ExcelIndexLeaf[]
  unmatched_db: DbTopicCandidate[]
} {
  type Pair = {
    leaf: ExcelIndexLeaf
    topic: DbTopicCandidate
    score: number
  }

  const pairs: Pair[] = []
  for (const leaf of leaves) {
    for (const topic of dbTopics) {
      const score = Math.max(
        matchScore(leaf.name, topic.tec_topic),
        matchScore(leaf.name, topic.name)
      )
      if (score >= SUGGEST_SCORE) {
        pairs.push({ leaf, topic, score })
      }
    }
  }

  pairs.sort((a, b) => b.score - a.score)

  const usedLeaves = new Set<string>()
  const usedTopics = new Set<string>()
  const matches: IndexMatchProposal[] = []

  for (const p of pairs) {
    if (usedLeaves.has(p.leaf.path) || usedTopics.has(p.topic.id)) continue
    usedLeaves.add(p.leaf.path)
    usedTopics.add(p.topic.id)
    matches.push({
      excel_code: p.leaf.code,
      excel_name: p.leaf.name,
      excel_path: p.leaf.path,
      parent_path: p.leaf.parent_path,
      db_node_id: p.topic.id,
      db_tec_topic: p.topic.tec_topic,
      score: p.score,
      default_confirmed: p.score >= AUTO_CONFIRM_SCORE,
    })
  }

  const unmatched_excel = leaves.filter((l) => !usedLeaves.has(l.path))
  const unmatched_db = dbTopics.filter((t) => !usedTopics.has(t.id))

  return { matches, unmatched_excel, unmatched_db }
}

export function parseNotebookIndexBuffer(
  buffer: Buffer,
  tecSubject: string
): {
  folders: ExcelIndexFolder[]
  leaves: ExcelIndexLeaf[]
  excel_subject_label: string
  sheet_names: string[]
} {
  const parsed = parseIncidenceXlsx(buffer)

  if (parsed.stats.topic_count === 0) {
    throw new Error(
      "O Excel não contém linhas de índice. Exporte o índice completo do caderno no TEC (colunas Hierarquia, Índice, Quantidade e Porcentagem)."
    )
  }

  const block = pickSubjectBlock(parsed.blocks, tecSubject)
  if (!block || block.groups.length === 0) {
    throw new Error("Nenhum bloco de índice encontrado na planilha.")
  }

  const tree = buildIncidenceTreeFromGroups(
    block.groups as Parameters<typeof buildIncidenceTreeFromGroups>[0]
  )

  const folders: ExcelIndexFolder[] = []
  const leaves: ExcelIndexLeaf[] = []
  flattenExcelTree(tree, null, folders, leaves)

  if (folders.length === 0 && leaves.length === 0) {
    throw new Error(
      "Não foi possível montar a hierarquia. Verifique se a coluna Hierarquia tem códigos como 01, 01.01, etc."
    )
  }

  return {
    folders,
    leaves,
    excel_subject_label: block.subject_label,
    sheet_names: parsed.sheet_names,
  }
}

export function buildNotebookIndexPreview(
  buffer: Buffer,
  tecSubject: string,
  dbTopics: DbTopicCandidate[]
): NotebookIndexPreview {
  const { folders, leaves, excel_subject_label, sheet_names } =
    parseNotebookIndexBuffer(buffer, tecSubject)

  const { matches, unmatched_excel, unmatched_db } = matchLeavesToDbTopics(
    leaves,
    dbTopics
  )

  const suggested_count = matches.filter((m) => !m.default_confirmed).length

  return {
    excel_subject_label,
    sheet_names,
    folders,
    leaves,
    matches,
    unmatched_excel,
    unmatched_db,
    stats: {
      folder_count: folders.length,
      leaf_count: leaves.length,
      matched_count: matches.length,
      suggested_count,
      unmatched_excel_count: unmatched_excel.length,
      unmatched_db_count: unmatched_db.length,
    },
  }
}

/** Pastas em ordem de profundidade (pais antes dos filhos). */
export function sortFoldersByDepth(folders: ApplyIndexFolderInput[]): ApplyIndexFolderInput[] {
  return [...folders].sort((a, b) => {
    const da = a.path.split("/").length
    const db = b.path.split("/").length
    if (da !== db) return da - db
    return a.path.localeCompare(b.path, "pt-BR")
  })
}

export function previewToApplyPayload(
  preview: NotebookIndexPreview,
  confirmedNodeIds: Set<string>
): {
  folders: ApplyIndexFolderInput[]
  matches: ApplyIndexMatchInput[]
} {
  const folders: ApplyIndexFolderInput[] = preview.folders.map((f) => ({
    path: f.path,
    parent_path: f.parent_path,
    name: f.name,
  }))

  const matches: ApplyIndexMatchInput[] = preview.matches
    .filter((m) => confirmedNodeIds.has(m.db_node_id))
    .map((m) => ({
      db_node_id: m.db_node_id,
      parent_path: m.parent_path,
    }))

  return { folders, matches }
}

export function normTopicKey(s: string): string {
  return normLabel(s)
}
