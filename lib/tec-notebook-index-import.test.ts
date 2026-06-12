import * as fs from "node:fs"
import * as path from "node:path"
import * as XLSX from "xlsx"
import { describe, expect, it } from "vitest"
import { expandWorksheetRange } from "./incidence-xlsx"
import {
  buildNotebookIndexPreview,
  buildNotebookIndexPreviewFromBuffers,
  parseNotebookIndexBuffer,
  previewToApplyPayload,
  sortFoldersByDepth,
} from "./tec-notebook-index-import"

function makeAfoFixtureBuffer(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Hierarquia", "Índice", "Quantidade", "Porcentagem"],
    ["", "AFO, Direito Financeiro e Contabilidade Publica", 10, 100],
    ["01", "Introdução à Administração Financeira e Orçamentária", 3, 1.76],
    ["01.01", "A Atividade Financeira do Estado", 1, 0.59],
    ["01.02", "Funções de Governo", 1, 0.59],
    ["02", "Orçamento Público", 2, 1.18],
    ["02.01", "Conceito e Natureza Jurídica do Orçamento Público", 1, 0.59],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Índice do Caderno")
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}

function makeTruncatedRefSheet(): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Hierarquia", "Índice", "Quantidade", "Porcentagem"],
    ["", "Auditoria Privada", 40, 100],
    ["01", "Estrutura Conceitual", 1, 2.5],
    ["02", "Auditoria Independente", 27, 67.5],
    ["02.01", "Normas Profissionais", 6, 15],
  ])
  ws["!ref"] = "A1:D1"
  return ws
}

describe("expandWorksheetRange", () => {
  it("corrige !ref truncado do export TEC", () => {
    const sheet = makeTruncatedRefSheet()
    expandWorksheetRange(sheet)
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][]
    expect(rows.length).toBeGreaterThan(4)
  })
})

const REAL_TEC_INDEX = path.join(
  "C:",
  "Users",
  "Daniel Ranna",
  "Desktop",
  "Auditoria indice.xlsx"
)

describe("parseNotebookIndexBuffer", () => {
  it("lê export real do TEC (Auditoria indice.xlsx)", () => {
    if (!fs.existsSync(REAL_TEC_INDEX)) return
    const buffer = fs.readFileSync(REAL_TEC_INDEX)
    const parsed = parseNotebookIndexBuffer(buffer, "Auditoria Privada")
    expect(parsed.folders.length).toBeGreaterThan(5)
    expect(parsed.leaves.length).toBeGreaterThan(20)
  })

  it("monta pastas e folhas a partir da hierarquia", () => {
    const buffer = makeAfoFixtureBuffer()
    const parsed = parseNotebookIndexBuffer(
      buffer,
      "AFO, Direito Financeiro e Contabilidade Pública"
    )

    expect(parsed.folders.length).toBe(2)
    expect(parsed.folders.map((f) => f.name)).toContain("Orçamento Público")
    expect(parsed.leaves.length).toBe(3)
    expect(parsed.leaves.map((l) => l.name)).toContain("A Atividade Financeira do Estado")
  })

  it("rejeita planilha só com cabeçalho", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Hierarquia", "Índice", "Quantidade", "Porcentagem"],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Índice do Caderno")
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer

    expect(() => parseNotebookIndexBuffer(buffer, "AFO")).toThrow(/não contém linhas/)
  })
})

function makeTiPartBuffer(partName: string, topicName: string): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Hierarquia", "Índice", "Quantidade", "Porcentagem"],
    ["", "Tecnologia da Informacao", 50, 100],
    ["01", `Area ${partName}`, 10, 20],
    ["01.01", topicName, 1, 2],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Índice do Caderno")
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}

describe("buildNotebookIndexPreviewFromBuffers", () => {
  it("mescla várias partes sem colidir paths 01", () => {
    const preview = buildNotebookIndexPreviewFromBuffers(
      [
        { buffer: makeTiPartBuffer("pt1", "Topico A"), fileName: "TI pt1.xlsx" },
        { buffer: makeTiPartBuffer("pt2", "Topico B"), fileName: "TI pt2.xlsx" },
      ],
      "Tecnologia da Informação",
      [
        { id: "a", tec_topic: "Topico A", name: "Topico A", question_count: 1 },
        { id: "b", tec_topic: "Topico B", name: "Topico B", question_count: 1 },
      ]
    )

    expect(preview.part_count).toBe(2)
    expect(preview.source_files).toEqual(["TI pt1.xlsx", "TI pt2.xlsx"])
    expect(preview.leaves.map((l) => l.path)).toContain("TI pt1/01/01.01")
    expect(preview.leaves.map((l) => l.path)).toContain("TI pt2/01/01.01")
    expect(preview.matches).toHaveLength(2)
  })
})

describe("buildNotebookIndexPreview", () => {
  it("pareia nomes do Excel com tópicos do banco", () => {
    const buffer = makeAfoFixtureBuffer()
    const preview = buildNotebookIndexPreview(buffer, "AFO, Direito Financeiro", [
      {
        id: "t1",
        tec_topic: "A Atividade Financeira do Estado",
        name: "A Atividade Financeira do Estado",
        question_count: 1,
      },
      {
        id: "t2",
        tec_topic: "Funcoes de Governo",
        name: "Funcoes de Governo",
        question_count: 1,
      },
      {
        id: "t3",
        tec_topic: "Topico extra no banco",
        name: "Topico extra no banco",
        question_count: 1,
      },
    ])

    expect(preview.stats.folder_count).toBe(2)
    expect(preview.matches.length).toBeGreaterThanOrEqual(2)
    expect(preview.matches.some((m) => m.db_node_id === "t1")).toBe(true)
    expect(preview.unmatched_db.some((u) => u.id === "t3")).toBe(true)
  })
})

describe("sortFoldersByDepth", () => {
  it("ordena pais antes dos filhos", () => {
    const sorted = sortFoldersByDepth([
      { path: "02/02.01", parent_path: "02", name: "Sub" },
      { path: "02", parent_path: null, name: "Pai" },
    ])
    expect(sorted[0]!.path).toBe("02")
    expect(sorted[1]!.path).toBe("02/02.01")
  })
})

describe("previewToApplyPayload", () => {
  it("filtra matches confirmados", () => {
    const preview = buildNotebookIndexPreview(makeAfoFixtureBuffer(), "AFO", [
      {
        id: "t1",
        tec_topic: "A Atividade Financeira do Estado",
        name: "A Atividade Financeira do Estado",
        question_count: 1,
      },
    ])
    const { matches } = previewToApplyPayload(preview, new Set(["t1"]))
    expect(matches).toHaveLength(1)
    expect(matches[0]!.db_node_id).toBe("t1")
  })
})
