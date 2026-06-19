import type { NotebookReportStructured } from "../../coach-types"
import type { BlockNotePatchOp, StoredNotebookDocument } from "../../blocknote/types"
import { runAgent } from "../run-agent"

const SYSTEM = `Você personaliza um caderno de erros de estudo em blocos BlockNote.
Recebe o documento atual (JSON v2 com blocks) e um novo relatório de erros.
Retorne APENAS operações de patch JSON — não reescreva o documento inteiro.

Tipos de bloco disponíveis: heading, paragraph, studyAlert, timeline, miniCards, tableCompare, studyAccordion, quote, barChart, chapterHeader, studySection, arrowList, priorityList, flashcardFlip, flashcardStatic, textFigure, sketchPad, headingLine, headingChip, headingNumbered, checkListItem, numberedListItem, bulletListItem, divider, codeBlock.

Operações:
- {"op":"add","afterBlockId":"id-opcional","block":{ "type": "...", "props": {...}, "content": [...] }}
- {"op":"update","blockId":"id","update":{ "props": {...} }}
- {"op":"remove","blockId":"id"}

Priorize: correlacionar erros entre tópicos, usar studyAlert pegadinha/atencao, timeline para evolução, tableCompare para confusões, studyAccordion para questões.
Máximo 8 operações. Português do Brasil.`

export async function runErrorNotebookCanvasAgent(params: {
  userId: string
  subjectId: string
  currentDocument: StoredNotebookDocument
  reportStructured: NotebookReportStructured
  skipLlm?: boolean
}): Promise<{ patches: BlockNotePatchOp[]; usedLlm: boolean }> {
  if (params.skipLlm) {
    return { patches: [], usedLlm: false }
  }

  const compact = {
    current_blocks_count: params.currentDocument.blocks.length,
    report: {
      headline: params.reportStructured.headline,
      weaknesses: params.reportStructured.weaknesses?.slice(0, 5),
      strengths: params.reportStructured.strengths?.slice(0, 3),
      per_question_sample: (params.reportStructured.per_question_errors ?? [])
        .slice(0, 5)
        .map((q) => ({
          topic: q.tec_topic,
          mistake: q.specific_mistake,
          feedback: q.feedback_detailed?.slice(0, 200),
          note: q.user_note?.slice(0, 120),
        })),
    },
  }

  const result = await runAgent({
    agentType: "error_notebook_canvas",
    userId: params.userId,
    subjectId: params.subjectId,
    systemPrompt: SYSTEM,
    userContent: JSON.stringify(compact),
    jsonMode: true,
    maxTokens: 2000,
    model: "gpt-4o-mini",
    metadata: { phase: "error_notebook_canvas" },
  })

  if (!result.usedLlm || !result.text) {
    return { patches: [], usedLlm: false }
  }

  try {
    const parsed = JSON.parse(result.text) as { patches?: BlockNotePatchOp[] }
    return { patches: parsed.patches ?? [], usedLlm: true }
  } catch {
    return { patches: [], usedLlm: false }
  }
}
