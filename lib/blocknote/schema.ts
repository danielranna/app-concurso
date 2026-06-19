import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core"
import { createStudyAlert } from "./blocks/alert"
import { createStudyAccordion, createStudySection } from "./blocks/accordion"
import { createBarChart } from "./blocks/bar-chart"
import { createChapterHeader } from "./blocks/chapter-header"
import {
  createFlashcardFlip,
  createFlashcardStatic,
} from "./blocks/flashcard"
import {
  createHeadingChip,
  createHeadingLine,
  createHeadingNumbered,
} from "./blocks/heading-variants"
import { createArrowList, createPriorityList } from "./blocks/lists"
import { createMiniCards } from "./blocks/mini-cards"
import { createSketchPad } from "./blocks/sketch-pad"
import { createTableCompare } from "./blocks/table-compare"
import { createTextFigure } from "./blocks/text-figure"
import { createTimeline } from "./blocks/timeline"

export const studyNotebookSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    studyAlert: createStudyAlert(),
    headingLine: createHeadingLine(),
    headingChip: createHeadingChip(),
    headingNumbered: createHeadingNumbered(),
    timeline: createTimeline(),
    miniCards: createMiniCards(),
    tableCompare: createTableCompare(),
    arrowList: createArrowList(),
    priorityList: createPriorityList(),
    flashcardFlip: createFlashcardFlip(),
    flashcardStatic: createFlashcardStatic(),
    barChart: createBarChart(),
    textFigure: createTextFigure(),
    sketchPad: createSketchPad(),
    chapterHeader: createChapterHeader(),
    studyAccordion: createStudyAccordion(),
    studySection: createStudySection(),
  },
})

export type StudyNotebookEditor = typeof studyNotebookSchema.BlockNoteEditor
