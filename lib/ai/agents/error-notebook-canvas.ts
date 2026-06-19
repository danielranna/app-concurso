import type { NotebookReportStructured } from "../../coach-types"
import type { CanvasDocument, CanvasPatchOp } from "../../canvas-blocks/types"
import { runAgent } from "../run-agent"

const SYSTEM = `Você personaliza um caderno de erros de estudo em blocos visuais.
Recebe o documento atual (JSON) e um novo relatório de erros.
Retorne APENAS operações de patch JSON — não reescreva o documento inteiro.

Tipos de bloco disponíveis: heading, paragraph, callout, timeline, mini_cards, pills, table, checklist, accordion, quote, bar_chart, chapter_header, section, columns, divider.

Operações:
- {"op":"add","afterBlockId":"id-opcional","block":{...}}
- {"op":"update","blockId":"id","props":{...}}
- {"op":"remove","blockId":"id"}

Priorize: correlacionar erros entre tópicos, usar callout pegadinha/atencao, timeline para evolução, table para confusões, accordion para questões.
Máximo 8 operações. Português do Brasil.`

export async function runErrorNotebookCanvasAgent(params: {
  userId: string
  subjectId: string
  currentDocument: CanvasDocument
  reportStructured: NotebookReportStructured
  skipLlm?: boolean
}): Promise<{ patches: CanvasPatchOp[]; usedLlm: boolean }> {
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
    const parsed = JSON.parse(result.text) as { patches?: CanvasPatchOp[] }
    return { patches: parsed.patches ?? [], usedLlm: true }
  } catch {
    return { patches: [], usedLlm: false }
  }
}
