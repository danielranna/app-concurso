import type { SubjectStudyDossierStructured } from "../coach-types"
import type { NotebookReportStructured } from "../coach-types"
import type { CanvasBlock, CanvasDocument, CanvasPatchOp } from "../canvas-blocks/types"
import { newBlockId } from "../canvas-blocks/types"

export function dossierStructuredToCanvas(
  structured: SubjectStudyDossierStructured,
  subjectName: string
): CanvasDocument {
  const blocks: CanvasBlock[] = [
    {
      id: newBlockId(),
      type: "heading",
      props: { level: 1, text: structured.headline || `Caderno de erros — ${subjectName}` },
    },
    {
      id: newBlockId(),
      type: "paragraph",
      props: { text: structured.opening_narrative },
    },
  ]

  for (const theme of structured.critical_themes) {
    blocks.push({
      id: newBlockId(),
      type: "callout",
      props: {
        variant: "pegadinha",
        title: theme.theme,
        body: `${theme.why_it_matters}\n\n${theme.understanding_md}`,
      },
    })
    if (theme.confusion_pairs?.length) {
      blocks.push({
        id: newBlockId(),
        type: "table",
        props: {
          headers: ["Crença errada", "Correto"],
          rows: theme.confusion_pairs.map((p) => [p.wrong_belief, p.correct]),
        },
      })
    }
  }

  if (structured.evolutions.length > 0) {
    blocks.push({
      id: newBlockId(),
      type: "timeline",
      props: {
        items: structured.evolutions.map((e) => ({
          date: e.topic,
          content: `${e.evidence}${e.encouragement ? ` — ${e.encouragement}` : ""}`,
        })),
      },
    })
  }

  for (const block of structured.study_blocks) {
    blocks.push({
      id: newBlockId(),
      type: "section",
      props: { title: block.title },
      children: [
        {
          id: newBlockId(),
          type: "paragraph",
          props: { text: block.content_md },
        },
      ],
    })
  }

  for (const note of structured.annotation_clarifications) {
    blocks.push({
      id: newBlockId(),
      type: "accordion",
      props: {
        items: [
          {
            title: `Dúvida: ${note.note_body.slice(0, 80)}${note.note_body.length > 80 ? "…" : ""}`,
            body: note.answer_md,
          },
        ],
      },
    })
  }

  return { version: 1, blocks }
}

export function reportToCanvasPatches(
  report: NotebookReportStructured,
  reportId: string
): CanvasPatchOp[] {
  const ops: CanvasPatchOp[] = []

  if (report.headline) {
    ops.push({
      op: "add",
      block: {
        id: newBlockId(),
        type: "heading",
        props: { level: 2, text: report.headline },
      },
    })
  }

  for (const w of report.weaknesses.slice(0, 5)) {
    ops.push({
      op: "add",
      block: {
        id: newBlockId(),
        type: "callout",
        props: {
          variant: w.severity === "alta" ? "atencao" : "pegadinha",
          title: `Fraqueza: ${w.topic}`,
          body: w.evidence,
        },
      },
    })
  }

  for (const s of report.strengths.slice(0, 3)) {
    ops.push({
      op: "add",
      block: {
        id: newBlockId(),
        type: "callout",
        props: {
          variant: "resumo",
          title: `Ponto forte: ${s.topic}`,
          body: s.evidence,
        },
      },
    })
  }

  const perQuestion = report.per_question_errors ?? []
  if (perQuestion.length > 0) {
    ops.push({
      op: "add",
      block: {
        id: newBlockId(),
        type: "accordion",
        props: {
          items: perQuestion.slice(0, 8).map((q, i) => ({
            title: q.header_label || `Questão ${i + 1}`,
            body: [
              q.feedback_detailed || q.specific_mistake || "",
              q.user_note ? `\n\nSua nota: ${q.user_note}` : "",
              q.note_clarification ? `\n\nEsclarecimento: ${q.note_clarification}` : "",
            ]
              .filter(Boolean)
              .join(""),
          })),
        },
      },
    })
  }

  if (report.weaknesses.length > 0) {
    ops.push({
      op: "add",
      block: {
        id: newBlockId(),
        type: "bar_chart",
        props: {
          title: "Erros por tópico (último relatório)",
          items: report.weaknesses.slice(0, 6).map((w) => ({
            label: w.topic.slice(0, 20),
            value: w.severity === "alta" ? 90 : w.severity === "media" ? 60 : 35,
          })),
        },
      },
    })
  }

  void reportId
  return ops
}

export function emptyErrorNotebook(subjectName: string): CanvasDocument {
  return {
    version: 1,
    blocks: [
      {
        id: newBlockId(),
        type: "chapter_header",
        props: {
          numeral: "I",
          period: "Caderno de erros",
          title: subjectName,
        },
      },
      {
        id: newBlockId(),
        type: "callout",
        props: {
          variant: "info",
          title: "Como funciona",
          body: "Este caderno é atualizado pela IA a cada relatório de caderno de questões. Conclua um caderno para começar.",
        },
      },
    ],
  }
}
