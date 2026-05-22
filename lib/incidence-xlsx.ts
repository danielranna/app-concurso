import * as XLSX from "xlsx"

export type IncidenceGroup = {
  code: string
  name: string
  quantity: number
  percent: number
}

export type IncidenceSubjectBlock = {
  subject_label: string
  total_quantity: number
  groups: IncidenceGroup[]
}

export type ParsedIncidenceWorkbook = {
  blocks: IncidenceSubjectBlock[]
  sheet_names: string[]
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
  if (typeof raw === "number") return raw
  const n = parseInt(String(raw ?? "0"), 10)
  return Number.isFinite(n) ? n : 0
}

function isGroupCode(hierarquia: string) {
  return /^\d{1,2}$/.test(hierarquia.trim())
}

function isSubtopicCode(hierarquia: string) {
  return /^\d{1,2}\.\d+/.test(hierarquia.trim())
}

/** Uma linha de matéria no Excel: hierarquia vazia e nome no índice. */
function isSubjectHeaderRow(hierarquia: string, indice: string) {
  return !hierarquia.trim() && indice.trim().length > 2
}

function parseSheetRows(rows: unknown[][]): IncidenceSubjectBlock[] {
  const blocks: IncidenceSubjectBlock[] = []
  let current: IncidenceSubjectBlock | null = null

  for (const row of rows) {
    const hierarquia = String(row[0] ?? "").trim()
    const indice = String(row[1] ?? "").trim()
    const qty = parseQuantity(row[2])
    const pct = parsePercent(row[3])

    if (!indice && !hierarquia) continue
    const lower = indice.toLowerCase()
    if (lower.includes("hierarquia") || lower.includes("índice")) continue

    if (isSubjectHeaderRow(hierarquia, indice)) {
      if (current?.groups.length) blocks.push(current)
      current = {
        subject_label: indice,
        total_quantity: qty,
        groups: [],
      }
      continue
    }

    if (!current) {
      current = {
        subject_label: "Matéria",
        total_quantity: 0,
        groups: [],
      }
    }

    if (isSubtopicCode(hierarquia)) continue

    if (isGroupCode(hierarquia)) {
      current.groups.push({
        code: hierarquia,
        name: indice,
        quantity: qty,
        percent: pct,
      })
    }
  }

  if (current?.groups.length) blocks.push(current)
  return blocks
}

export function parseIncidenceXlsx(buffer: Buffer): ParsedIncidenceWorkbook {
  const wb = XLSX.read(buffer, { type: "buffer" })
  const blocks: IncidenceSubjectBlock[] = []

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
    }) as unknown[][]
    blocks.push(...parseSheetRows(rows))
  }

  return {
    blocks,
    sheet_names: wb.SheetNames,
  }
}

/** Resumo compacto para o LLM (só agrupamentos, top N por %). */
export function incidenceSummaryForLlm(
  parsed: ParsedIncidenceWorkbook,
  maxGroups = 25
) {
  const out: { subject: string; topics: { name: string; percent: number; qty: number }[] }[] =
    []

  for (const block of parsed.blocks) {
    const sorted = [...block.groups].sort((a, b) => b.percent - a.percent)
    out.push({
      subject: block.subject_label,
      topics: sorted.slice(0, maxGroups).map((g) => ({
        name: g.name,
        percent: g.percent,
        qty: g.quantity,
      })),
    })
  }
  return out
}
