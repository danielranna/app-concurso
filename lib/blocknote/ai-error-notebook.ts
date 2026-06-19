import type { NotebookReportStructured } from "@/lib/coach-types"
import type { SubjectStudyDossierStructured } from "@/lib/coach-types"
import { stringifyJsonProp, textToInline } from "./helpers"
import type { BlockNotePatchOp, StoredNotebookDocument } from "./types"
import type { StudyNotebookBlock } from "./types"

export function dossierStructuredToBlockNote(
  structured: SubjectStudyDossierStructured,
  subjectName: string
): StoredNotebookDocument {
  const blocks: StudyNotebookBlock[] = [
    {
      type: "heading",
      props: { level: 1 },
      content: textToInline(
        structured.headline || `Caderno de erros — ${subjectName}`
      ),
    },
    {
      type: "paragraph",
      content: textToInline(structured.opening_narrative),
    },
  ]

  for (const theme of structured.critical_themes) {
    blocks.push({
      type: "studyAlert",
      props: {
        variant: "pegadinha",
        title: theme.theme,
      },
      content: textToInline(
        `${theme.why_it_matters}\n\n${theme.understanding_md}`
      ),
    })
    if (theme.confusion_pairs?.length) {
      blocks.push({
        type: "tableCompare",
        props: {
          headersJson: stringifyJsonProp(["Crença errada", "Correto"]),
          rowsJson: stringifyJsonProp(
            theme.confusion_pairs.map((p) => [p.wrong_belief, p.correct])
          ),
        },
      })
    }
  }

  if (structured.evolutions.length > 0) {
    blocks.push({
      type: "timeline",
      props: {
        itemsJson: stringifyJsonProp(
          structured.evolutions.map((e) => ({
            date: e.topic,
            content: `${e.evidence}${e.encouragement ? ` — ${e.encouragement}` : ""}`,
          }))
        ),
      },
    })
  }

  for (const block of structured.study_blocks) {
    blocks.push({
      type: "studySection",
      props: { title: block.title },
    })
    blocks.push({
      type: "paragraph",
      content: textToInline(block.content_md),
    })
  }

  for (const note of structured.annotation_clarifications) {
    blocks.push({
      type: "studyAccordion",
      props: {
        itemsJson: stringifyJsonProp([
          {
            title: `Dúvida: ${note.note_body.slice(0, 80)}${note.note_body.length > 80 ? "…" : ""}`,
            body: note.answer_md,
          },
        ]),
      },
    })
  }

  return { version: 2, blocks }
}

export function reportToBlockNotePatches(
  report: NotebookReportStructured,
  _reportId: string
): BlockNotePatchOp[] {
  const ops: BlockNotePatchOp[] = []

  if (report.headline) {
    ops.push({
      op: "add",
      block: {
        type: "heading",
        props: { level: 2 },
        content: textToInline(report.headline),
      },
    })
  }

  for (const w of report.weaknesses.slice(0, 5)) {
    ops.push({
      op: "add",
      block: {
        type: "studyAlert",
        props: {
          variant: w.severity === "alta" ? "atencao" : "pegadinha",
          title: `Fraqueza: ${w.topic}`,
        },
        content: textToInline(w.evidence),
      },
    })
  }

  for (const s of report.strengths.slice(0, 3)) {
    ops.push({
      op: "add",
      block: {
        type: "studyAlert",
        props: {
          variant: "resumo",
          title: `Ponto forte: ${s.topic}`,
        },
        content: textToInline(s.evidence),
      },
    })
  }

  const perQuestion = report.per_question_errors ?? []
  if (perQuestion.length > 0) {
    ops.push({
      op: "add",
      block: {
        type: "studyAccordion",
        props: {
          itemsJson: stringifyJsonProp(
            perQuestion.slice(0, 8).map((q, i) => ({
              title: q.header_label || `Questão ${i + 1}`,
              body: [
                q.feedback_detailed || q.specific_mistake || "",
                q.user_note ? `\n\nSua nota: ${q.user_note}` : "",
                q.note_clarification
                  ? `\n\nEsclarecimento: ${q.note_clarification}`
                  : "",
              ]
                .filter(Boolean)
                .join(""),
            }))
          ),
        },
      },
    })
  }

  if (report.weaknesses.length > 0) {
    ops.push({
      op: "add",
      block: {
        type: "barChart",
        props: {
          title: "Erros por tópico (último relatório)",
          itemsJson: stringifyJsonProp(
            report.weaknesses.slice(0, 6).map((w) => ({
              label: w.topic.slice(0, 20),
              value: w.severity === "alta" ? 90 : w.severity === "media" ? 60 : 35,
            }))
          ),
        },
      },
    })
  }

  return ops
}

export function emptyErrorNotebookBlockNote(
  subjectName: string
): StoredNotebookDocument {
  return {
    version: 2,
    blocks: [
      {
        type: "chapterHeader",
        props: {
          numeral: "I",
          period: "Caderno de erros",
          title: subjectName,
        },
      },
      {
        type: "studyAlert",
        props: {
          variant: "info",
          title: "Como funciona",
        },
        content: textToInline(
          "Este caderno é atualizado pela IA a cada relatório de caderno de questões. Conclua um caderno para começar."
        ),
      },
    ],
  }
}
