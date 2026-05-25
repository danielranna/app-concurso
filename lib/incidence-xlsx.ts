import * as XLSX from "xlsx"
import {
  hierarchyDepth,
  normalizeHierarchyCode,
  parentCodeFromHierarchy,
} from "./incidence-hierarchy"

export type IncidenceGroup = {
  code: string
  name: string
  quantity: number
  percent: number
  is_subtopic?: boolean
  parent_code?: string | null
}

export type IncidenceSubjectBlock = {
  subject_label: string
  total_quantity: number
  groups: IncidenceGroup[]
}

export type IncidenceFlatRow = {
  sheet_name: string
  subject_label: string
  hierarchy_code: string
  topic_name: string
  is_subtopic: boolean
  parent_code: string | null
  quantity: number
  percent: number
}

export type IncidenceParseStats = {
  subject_count: number
  topic_count: number
  subtopic_count: number
  ignored_count: number
  ignored_samples: string[]
  /** Alias para UI */
  subjects?: number
  topics?: number
  subtopics?: number
  rows_imported?: number
  rows_ignored?: number
  rows_inserted_db?: number
  persist_error?: string | null
}

/** Stats unificados para alertas e tela Editais */
export function displayParseStats(
  stats: IncidenceParseStats,
  opts?: { rowsInsertedDb?: number; persistError?: string | null }
): IncidenceParseStats {
  const rows_imported = stats.rows_inserted_db ?? opts?.rowsInsertedDb ?? stats.rows_imported ?? stats.topic_count
  return {
    ...stats,
    subjects: stats.subjects ?? stats.subject_count,
    topics: stats.topics ?? stats.topic_count,
    subtopics: stats.subtopics ?? stats.subtopic_count,
    rows_imported,
    rows_ignored: stats.rows_ignored ?? stats.ignored_count,
    rows_inserted_db: opts?.rowsInsertedDb ?? stats.rows_inserted_db,
    persist_error: opts?.persistError ?? stats.persist_error ?? null,
  }
}

/** Gera flat_rows a partir dos blocos se o parser não preencheu (fallback). */
export function flatRowsFromBlocks(
  blocks: IncidenceSubjectBlock[],
  sheetName = "Planilha"
): IncidenceFlatRow[] {
  const flat: IncidenceFlatRow[] = []
  for (const block of blocks) {
    for (const g of block.groups) {
      flat.push({
        sheet_name: sheetName,
        subject_label: block.subject_label,
        hierarchy_code: g.code,
        topic_name: g.name,
        is_subtopic: !!g.is_subtopic,
        parent_code: g.parent_code ?? null,
        quantity: g.quantity,
        percent: g.percent,
      })
    }
  }
  return flat
}

export type ParsedIncidenceWorkbook = {
  blocks: IncidenceSubjectBlock[]
  flat_rows: IncidenceFlatRow[]
  sheet_names: string[]
  stats: IncidenceParseStats
}

function parsePercent(raw: unknown): number {
  if (raw == null) return 0
  if (typeof raw === "number") {
    return raw <= 1 && raw > 0 ? Math.round(raw * 1000) / 10 : raw
  }
  const s = String(raw).replace("%", "").replace(",", ".").trim()
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return 0
  return n <= 1 && n > 0 && !s.includes("%") ? n * 100 : n
}

function parseQuantity(raw: unknown): number {
  if (typeof raw === "number") return Math.round(raw)
  const n = parseInt(String(raw ?? "0"), 10)
  return Number.isFinite(n) ? n : 0
}

function cellHierarchy(raw: unknown): string {
  if (raw == null || raw === "") return ""
  return normalizeHierarchyCode(String(raw).trim())
}

function isHierarchyCode(hierarquia: string) {
  const h = normalizeHierarchyCode(hierarquia)
  return /^\d{2}(\.\d{2})*$/.test(h)
}

/** Cabeçalho de matéria (sem código hierárquico). Dentro de um bloco, linha vazia = tópico pai, não nova matéria. */
function isSubjectHeaderRow(
  hierarquia: string,
  indice: string,
  insideSubject: boolean
) {
  const h = hierarquia.trim()
  const i = indice.trim()
  if (!i) return false
  if (insideSubject && !h) return false
  if (!h && i.length > 2) return true
  if (/^[A-Z]{2,5}$/i.test(h) && i.length > 8) return true
  return false
}

function inferTopLevelCode(groups: IncidenceGroup[]): string {
  const topNums = groups
    .filter((g) => !g.parent_code)
    .map((g) => parseInt(g.code.split(".")[0]!, 10))
    .filter((n) => Number.isFinite(n))
  const next = (topNums.length ? Math.max(...topNums) : 0) + 1
  return String(next).padStart(2, "0")
}

function pushTopic(
  current: IncidenceSubjectBlock,
  flat: IncidenceFlatRow[],
  sheetName: string,
  hierarquia: string,
  indice: string,
  qty: number,
  pct: number
) {
  const code = hierarquia.trim()
    ? normalizeHierarchyCode(hierarquia)
    : inferTopLevelCode(current.groups)
  const name = indice.trim()
  if (!name) return

  const depth = hierarchyDepth(code)
  const parent = parentCodeFromHierarchy(code)

  current.groups.push({
    code,
    name,
    quantity: qty,
    percent: pct,
    is_subtopic: depth > 1,
    parent_code: parent,
  })

  flat.push({
    sheet_name: sheetName,
    subject_label: current.subject_label,
    hierarchy_code: code,
    topic_name: name,
    is_subtopic: depth > 1,
    parent_code: parent,
    quantity: qty,
    percent: pct,
  })
}

function parseSheetRows(
  rows: unknown[][],
  sheetName: string,
  flat: IncidenceFlatRow[],
  ignored: string[]
): IncidenceSubjectBlock[] {
  const blocks: IncidenceSubjectBlock[] = []
  let current: IncidenceSubjectBlock | null = null

  for (const row of rows) {
    const hierarquia = cellHierarchy(row[0])
    const indice = String(row[1] ?? "").trim()
    const qty = parseQuantity(row[2])
    const pct = parsePercent(row[3])

    if (!indice && !hierarquia) continue
    const lower = indice.toLowerCase()
    if (lower.includes("hierarquia") || lower.includes("índice") || lower === "total") {
      continue
    }

    if (isSubjectHeaderRow(hierarquia, indice, !!current)) {
      if (current && (current.groups.length || current.subject_label !== "Matéria")) {
        blocks.push(current)
      }
      current = {
        subject_label: indice,
        total_quantity: qty,
        groups: [],
      }
      continue
    }

    if (!current) {
      current = {
        subject_label: "Sem classificação",
        total_quantity: 0,
        groups: [],
      }
    }

    if (isHierarchyCode(hierarquia)) {
      pushTopic(current, flat, sheetName, hierarquia, indice, qty, pct)
      continue
    }

    if (indice.length > 2) {
      pushTopic(current, flat, sheetName, "", indice, qty, pct)
      continue
    }

    if (ignored.length < 20) {
      ignored.push(`${hierarquia}|${indice}`)
    }
  }

  if (current && current.groups.length) blocks.push(current)
  return blocks
}

export function parseIncidenceXlsx(buffer: Buffer): ParsedIncidenceWorkbook {
  const wb = XLSX.read(buffer, { type: "buffer" })
  const blocks: IncidenceSubjectBlock[] = []
  const flat_rows: IncidenceFlatRow[] = []
  const ignored_samples: string[] = []

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
    }) as unknown[][]
    const beforeIgnored = ignored_samples.length
    blocks.push(...parseSheetRows(rows, sheetName, flat_rows, ignored_samples))
    const ignoredHere = ignored_samples.length - beforeIgnored
    void ignoredHere
  }

  const subtopic_count = flat_rows.filter((r) => r.is_subtopic).length
  const topic_count = flat_rows.length

  return {
    blocks,
    flat_rows,
    sheet_names: wb.SheetNames,
    stats: {
      subject_count: blocks.length,
      topic_count,
      subtopic_count,
      ignored_count: ignored_samples.length,
      ignored_samples,
    },
  }
}

export function incidenceSummaryForLlm(
  parsed: ParsedIncidenceWorkbook,
  maxGroups = 50
) {
  const out: { subject: string; topics: { name: string; percent: number; qty: number; code: string }[] }[] =
    []

  for (const block of parsed.blocks) {
    const sorted = [...block.groups].sort((a, b) => b.percent - a.percent)
    out.push({
      subject: block.subject_label,
      topics: sorted.slice(0, maxGroups).map((g) => ({
        name: g.name,
        percent: g.percent,
        qty: g.quantity,
        code: g.code,
      })),
    })
  }
  return out
}
