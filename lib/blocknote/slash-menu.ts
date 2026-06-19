import type { BlockNoteEditor } from "@blocknote/core"
import { combineByGroup } from "@blocknote/core"
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions"
import {
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from "@blocknote/react"
import type { studyNotebookSchema } from "./schema"

type Editor = BlockNoteEditor<
  typeof studyNotebookSchema.blockSchema,
  typeof studyNotebookSchema.inlineContentSchema,
  typeof studyNotebookSchema.styleSchema
>

function replaceBlock(
  editor: Editor,
  block: Partial<{
    type: string
    props?: Record<string, unknown>
    content?: unknown
  }>
) {
  const current = editor.getTextCursorPosition().block
  editor.updateBlock(current, block as never)
}

function customItems(editor: Editor): DefaultReactSuggestionItem[] {
  const mk = (
    title: string,
    group: string,
    aliases: string[],
    block: Parameters<typeof replaceBlock>[1]
  ): DefaultReactSuggestionItem => ({
    title,
    group,
    aliases,
    onItemClick: () => replaceBlock(editor, block),
  })

  return [
    mk("Título com linha", "Texto", ["titulo", "linha"], {
      type: "headingLine",
      content: "",
    }),
    mk("Título chip", "Texto", ["chip", "destaque"], {
      type: "headingChip",
      content: "",
    }),
    mk("Subtítulo numerado", "Texto", ["numero", "numerado"], {
      type: "headingNumbered",
      props: { number: "1" },
      content: "",
    }),
    mk("Destaque / callout", "Destaque", ["alerta", "callout", "dica"], {
      type: "studyAlert",
      props: { variant: "dica", title: "" },
      content: "",
    }),
    mk("Linha do tempo", "Dados", ["timeline", "cronologia"], {
      type: "timeline",
      props: { itemsJson: "[]" },
    }),
    mk("Mini cards", "Dados", ["cards", "cartoes"], {
      type: "miniCards",
      props: { cardsJson: "[]" },
    }),
    mk("Tabela comparativa", "Dados", ["tabela", "compare"], {
      type: "tableCompare",
      props: {
        headersJson: '["Coluna A","Coluna B"]',
        rowsJson: "[]",
      },
    }),
    mk("Lista com setas", "Organização", ["setas", "arrow"], {
      type: "arrowList",
      props: { itemsJson: "[]" },
    }),
    mk("Lista de prioridade", "Organização", ["prioridade"], {
      type: "priorityList",
      props: { itemsJson: "[]" },
    }),
    mk("Flashcard virar", "Mídia", ["flashcard", "flip"], {
      type: "flashcardFlip",
      props: { front: "", back: "" },
    }),
    mk("Flashcard estático", "Mídia", ["resumo", "card"], {
      type: "flashcardStatic",
      props: { title: "", body: "" },
    }),
    mk("Gráfico de barras", "Mídia", ["grafico", "chart"], {
      type: "barChart",
      props: { title: "", itemsJson: "[]" },
    }),
    mk("Texto + figura", "Mídia", ["figura", "imagem"], {
      type: "textFigure",
      props: { imageUrl: "", caption: "" },
      content: "",
    }),
    mk("Esboço livre", "Mídia", ["sketch", "desenho"], {
      type: "sketchPad",
      props: { dataUrl: "" },
    }),
    mk("Cabeçalho de capítulo", "Organização", ["capitulo", "chapter"], {
      type: "chapterHeader",
      props: { numeral: "I", period: "", title: "" },
    }),
    mk("Acordeão", "Organização", ["accordion", "dobravel"], {
      type: "studyAccordion",
      props: { itemsJson: "[]" },
    }),
    mk("Seção", "Organização", ["secao", "section"], {
      type: "studySection",
      props: { title: "" },
    }),
    {
      title: "Duas colunas",
      group: "Organização",
      aliases: ["colunas", "lado", "2 colunas", "columns"],
      onItemClick: () =>
        insertOrUpdateBlockForSlashMenu(editor, {
          type: "columnList",
          children: [
            { type: "column", children: [{ type: "paragraph" }] },
            { type: "column", children: [{ type: "paragraph" }] },
          ],
        }),
    },
    {
      title: "Três colunas",
      group: "Organização",
      aliases: ["3 colunas", "tres colunas"],
      onItemClick: () =>
        insertOrUpdateBlockForSlashMenu(editor, {
          type: "columnList",
          children: [
            { type: "column", children: [{ type: "paragraph" }] },
            { type: "column", children: [{ type: "paragraph" }] },
            { type: "column", children: [{ type: "paragraph" }] },
          ],
        }),
    },
  ]
}

export function getStudySlashMenuItems(editor: Editor) {
  return combineByGroup(
    getDefaultReactSlashMenuItems(editor),
    customItems(editor)
  )
}
