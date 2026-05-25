import type { IncidenceGroup, IncidenceSubjectBlock } from "./incidence-xlsx"

export type IncidenceTreeNode = {
  code: string
  name: string
  quantity: number
  percent: number
  children: IncidenceTreeNode[]
}

/** Excel costuma gravar 2 e 2.01 como número → normaliza para 02 e 02.01 */
export function normalizeHierarchyCode(code: string): string {
  const t = code.trim()
  if (!t || !/^\d+(\.\d+)*$/.test(t)) return t
  return t
    .split(".")
    .map((part) => String(parseInt(part, 10)).padStart(2, "0"))
    .join(".")
}

export function parentCodeFromHierarchy(code: string): string | null {
  const trimmed = normalizeHierarchyCode(code)
  if (!trimmed || !trimmed.includes(".")) return null
  const parts = trimmed.split(".")
  parts.pop()
  return parts.join(".") || null
}

export function hierarchyDepth(code: string): number {
  const t = code.trim()
  if (!t) return 0
  return t.split(".").length
}

function compareHierarchyCodes(a: string, b: string): number {
  const pa = a.split(".").map((p) => parseInt(p, 10) || 0)
  const pb = b.split(".").map((p) => parseInt(p, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

function sortTree(nodes: IncidenceTreeNode[]) {
  nodes.sort((a, b) => compareHierarchyCodes(a.code, b.code))
  for (const n of nodes) sortTree(n.children)
}

function resolveParentCode(
  code: string,
  explicitParent: string | null | undefined,
  nodes: Map<string, IncidenceTreeNode>
): string | null {
  const candidates = [
    explicitParent?.trim(),
    parentCodeFromHierarchy(code),
  ].filter(Boolean) as string[]

  for (const raw of candidates) {
    const p = normalizeHierarchyCode(raw)
    if (nodes.has(p)) return p
  }
  return null
}

export function buildIncidenceTreeFromGroups(groups: IncidenceGroup[]): IncidenceTreeNode[] {
  const withCode = groups
    .filter((g) => g.code?.trim())
    .map((g) => ({
      ...g,
      code: normalizeHierarchyCode(g.code),
      parent_code: g.parent_code
        ? normalizeHierarchyCode(g.parent_code)
        : parentCodeFromHierarchy(g.code),
    }))

  const nodes = new Map<string, IncidenceTreeNode>()

  for (const g of withCode) {
    const code = g.code.trim()
    nodes.set(code, {
      code,
      name: g.name,
      quantity: g.quantity,
      percent: g.percent,
      children: [],
    })
  }

  const roots: IncidenceTreeNode[] = []

  for (const g of withCode) {
    const code = g.code.trim()
    const node = nodes.get(code)!
    const parent = resolveParentCode(code, g.parent_code, nodes)
    if (parent) {
      nodes.get(parent)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  sortTree(roots)
  return roots
}

export function buildTreesBySubject(
  blocks: IncidenceSubjectBlock[]
): Record<string, IncidenceTreeNode[]> {
  const out: Record<string, IncidenceTreeNode[]> = {}
  for (const block of blocks) {
    out[block.subject_label] = buildIncidenceTreeFromGroups(block.groups)
  }
  return out
}

export function countTreeNodes(nodes: IncidenceTreeNode[]): number {
  let n = 0
  for (const node of nodes) {
    n += 1 + countTreeNodes(node.children)
  }
  return n
}
