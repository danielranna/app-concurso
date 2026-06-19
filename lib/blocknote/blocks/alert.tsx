"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { BlockField, updateProps } from "./shared"

const VARIANTS = [
  "atencao",
  "dica",
  "definicao",
  "exemplo",
  "pegadinha",
  "info",
  "prova",
  "resumo",
  "destaque",
] as const

export const createStudyAlert = createReactBlockSpec(
  {
    type: "studyAlert",
    propSchema: {
      variant: { default: "dica", values: VARIANTS },
      title: { default: "" },
    },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => {
      const readOnly = !editor.isEditable
      const variant = block.props.variant
      return (
        <div className={`cb-callout cb-callout-${variant}`}>
          <div className="cb-callout-title">
            <BlockField
              value={block.props.title}
              readOnly={readOnly}
              placeholder="Título do destaque"
              onChange={(title) => updateProps(editor, block.id, { title })}
            />
          </div>
          {!readOnly && (
            <select
              value={variant}
              onChange={(e) =>
                updateProps(editor, block.id, { variant: e.target.value })
              }
              className="mb-2 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600"
            >
              {VARIANTS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
          <div ref={contentRef} className="cb-paragraph min-h-[1.25rem]" />
        </div>
      )
    },
  }
)
