import type { BlockType } from "./types"
import { newBlockId } from "./types"

export type BlockMeta = {
  type: BlockType
  label: string
  category: "texto" | "destaque" | "layout" | "dados" | "midia"
  defaultProps: () => Record<string, unknown>
}

export const BLOCK_REGISTRY: BlockMeta[] = [
  {
    type: "heading",
    label: "Título",
    category: "texto",
    defaultProps: () => ({ level: 2, text: "Novo título" }),
  },
  {
    type: "paragraph",
    label: "Parágrafo",
    category: "texto",
    defaultProps: () => ({ text: "" }),
  },
  {
    type: "chapter_header",
    label: "Capítulo",
    category: "texto",
    defaultProps: () => ({ numeral: "I", period: "", title: "Título do capítulo" }),
  },
  {
    type: "divider",
    label: "Divisor",
    category: "layout",
    defaultProps: () => ({}),
  },
  {
    type: "section",
    label: "Seção",
    category: "layout",
    defaultProps: () => ({ title: "Nova seção" }),
  },
  {
    type: "columns",
    label: "Colunas",
    category: "layout",
    defaultProps: () => ({ count: 2 }),
  },
  {
    type: "callout",
    label: "Destaque",
    category: "destaque",
    defaultProps: () => ({
      variant: "dica",
      title: "Dica",
      body: "",
    }),
  },
  {
    type: "timeline",
    label: "Linha do tempo",
    category: "dados",
    defaultProps: () => ({
      items: [{ date: "2020", content: "Evento" }],
    }),
  },
  {
    type: "mini_cards",
    label: "Cards lado a lado",
    category: "layout",
    defaultProps: () => ({
      cards: [
        { title: "Card 1", body: "" },
        { title: "Card 2", body: "" },
      ],
    }),
  },
  {
    type: "pills",
    label: "Tags",
    category: "texto",
    defaultProps: () => ({ items: ["tag"], tone: "gold" }),
  },
  {
    type: "table",
    label: "Tabela",
    category: "dados",
    defaultProps: () => ({
      headers: ["Coluna A", "Coluna B"],
      rows: [["", ""]],
    }),
  },
  {
    type: "checklist",
    label: "Checklist",
    category: "dados",
    defaultProps: () => ({ items: [{ text: "Item", checked: false }] }),
  },
  {
    type: "numbered_list",
    label: "Lista numerada",
    category: "dados",
    defaultProps: () => ({ items: ["Primeiro item"] }),
  },
  {
    type: "accordion",
    label: "Accordion",
    category: "layout",
    defaultProps: () => ({
      items: [{ title: "Pergunta", body: "Resposta" }],
    }),
  },
  {
    type: "quote",
    label: "Citação",
    category: "texto",
    defaultProps: () => ({ text: "", footer: "" }),
  },
  {
    type: "formula",
    label: "Fórmula",
    category: "texto",
    defaultProps: () => ({ formula: "E = mc²", caption: "" }),
  },
  {
    type: "code",
    label: "Código",
    category: "texto",
    defaultProps: () => ({ language: "text", code: "" }),
  },
  {
    type: "bar_chart",
    label: "Gráfico de barras",
    category: "midia",
    defaultProps: () => ({
      title: "Desempenho",
      items: [
        { label: "A", value: 70 },
        { label: "B", value: 45 },
      ],
    }),
  },
  {
    type: "sketch",
    label: "Esboço",
    category: "midia",
    defaultProps: () => ({ strokes: "" }),
  },
]

export function createBlock(type: BlockType) {
  const meta = BLOCK_REGISTRY.find((b) => b.type === type)
  if (!meta) throw new Error(`Unknown block type: ${type}`)
  const block = {
    id: newBlockId(),
    type,
    props: meta.defaultProps(),
  }
  if (type === "section" || type === "columns") {
    return {
      ...block,
      children:
        type === "columns"
          ? [
              { id: newBlockId(), type: "paragraph" as const, props: { text: "" } },
              { id: newBlockId(), type: "paragraph" as const, props: { text: "" } },
            ]
          : [],
    }
  }
  return block
}

export function getBlockMeta(type: BlockType): BlockMeta | undefined {
  return BLOCK_REGISTRY.find((b) => b.type === type)
}
