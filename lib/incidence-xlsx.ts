import * as XLSX from "xlsx"

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

function isGroupCode(hierarquia: string) {
  return /^\d{1,2}$/.test(hierarquia.trim())
}

function isSubtopicCode(hierarquia: string) {
  return /^\d{1,2}\.\d+/.test(hierarquia.trim())
}

function parentCodeFromSubtopic(hierarquia: string): string | null {
  const m = hierarquia.trim().match(/^(\d{1,2})\./)
  return m ? m[1]! : null
}

function isSubjectHeaderRow(hierarquia: string, indice: string) {
  if (!hierarquia.trim() && indice.trim().length > 2) return true
  const h = hierarquia.trim()
  const i = indice.trim()
  if (/^[A-Z]{2,5}$/i.test(h) && i.length > 8) return true
  return false
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
  const isSub = isSubtopicCode(hierarquia)
  const code = hierarquia.trim() || (isSub ? "" : String(current.groups.length + 1).padStart(2, "0"))
  const name = indice.trim()
  if (!name) return

  const parent = isSub ? parentCodeFromSubtopic(hierarquia) : null

  current.groups.push({
    code,
    name,
    quantity: qty,
    percent: pct,
    is_subtopic: isSub,
    parent_code: parent,
  })

  flat.push({
    sheet_name: sheetName,
    subject_label: current.subject_label,
    hierarchy_code: code,
    topic_name: name,
    is_subtopic: isSub,
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
    const hierarquia = String(row[0] ?? "").trim()
    const indice = String(row[1] ?? "").trim()
    const qty = parseQuantity(row[2])
    const pct = parsePercent(row[3])

    if (!indice && !hierarquia) continue
    const lower = indice.toLowerCase()
    if (lower.includes("hierarquia") || lower.includes("índice") || lower === "total") {
      continue
    }

    if (isSubjectHeaderRow(hierarquia, indice)) {
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

    if (isSubtopicCode(hierarquia) || isGroupCode(hierarquia)) {
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
