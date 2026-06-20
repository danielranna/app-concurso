"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { BlockField, updateProps } from "./shared"

export const createChapterHeader = createReactBlockSpec(
  {
    type: "chapterHeader",
    propSchema: {
      numeral: { default: "I" },
      period: { default: "" },
      title: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const readOnly = !editor.isEditable
      return (
        <div className="cb-chapter">
          <div className="cb-chapter-num">
            <BlockField
              value={block.props.numeral}
              readOnly={readOnly}
              className="cb-field uppercase tracking-widest"
              onChange={(numeral) => updateProps(editor, block.id, { numeral })}
            />
          </div>
          <div className="cb-chapter-period">
            <BlockField
              value={block.props.period}
              readOnly={readOnly}
              placeholder="Período"
              className="cb-field"
              onChange={(period) => updateProps(editor, block.id, { period })}
            />
          </div>
          <div className="cb-chapter-title">
            <BlockField
              value={block.props.title}
              readOnly={readOnly}
              placeholder="Título do capítulo"
              className="cb-field font-bold"
              onChange={(title) => updateProps(editor, block.id, { title })}
            />
          </div>
        </div>
      )
    },
  }
)
