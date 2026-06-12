import { describe, expect, it } from "vitest"
import {
  collectTecTopicsFromTree,
  computeOrphanTecTopics,
} from "./tec-tree-sync"
import type { TecSubjectTreeResponse } from "./tec-subject-tree-types"

describe("computeOrphanTecTopics", () => {
  const tree: TecSubjectTreeResponse = {
    tec_subject: "TI",
    nodes: [
      {
        id: "f1",
        user_id: "u",
        tec_subject: "TI",
        parent_id: null,
        node_type: "folder",
        name: "Pt1",
        tec_topic: null,
        sort_order: 0,
        question_count: 2,
        children: [
          {
            id: "t1",
            user_id: "u",
            tec_subject: "TI",
            parent_id: "f1",
            node_type: "topic",
            name: "Topico A",
            tec_topic: "Topico A",
            sort_order: 0,
            question_count: 1,
          },
        ],
      },
    ],
    ungrouped: [],
    total_questions: 3,
  }

  it("lista assuntos do banco ausentes na árvore", () => {
    const inTree = collectTecTopicsFromTree(tree)
    expect(inTree.has("Topico A")).toBe(true)

    const orphans = computeOrphanTecTopics([tree], [
      {
        tec_subject: "TI",
        topics: ["Topico A", "Topico B", "(sem assunto classificado)"],
      },
    ])

    expect(orphans).toEqual([{ tec_subject: "TI", topics: ["Topico B"] }])
  })
})
