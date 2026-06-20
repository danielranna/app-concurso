"use client"

import { createReactBlockSpec } from "@blocknote/react"
import {
  ALERT_META,
  ALERT_VARIANTS,
  type AlertVariant,
} from "./catalog-meta"
import { updateProps } from "./shared"

export const createStudyAlert = createReactBlockSpec(
  {
    type: "studyAlert",
    propSchema: {
      variant: { default: "dica", values: ALERT_VARIANTS },
      title: { default: "" },
    },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => {
      const readOnly = !editor.isEditable
      const variant = block.props.variant as AlertVariant
      const meta = ALERT_META[variant] ?? ALERT_META.dica
      const title = block.props.title || meta.label

      return (
        <div className={`nota-caixa ${meta.css}`}>
          <div className="nota-cabecalho">
            <span className="nota-icone" aria-hidden="true">
              {meta.icon}
            </span>
            {readOnly ? (
              <span>{title}</span>
            ) : (
              <input
                className="nota-titulo-input"
                value={block.props.title}
                placeholder={meta.label}
                onChange={(e) =>
                  updateProps(editor, block.id, { title: e.target.value })
                }
              />
            )}
            <span className="nota-rotulo">{meta.short}</span>
          </div>
          <div ref={contentRef} className="nota-corpo" />
          {!readOnly && (
            <div className="nota-variantes">
              {ALERT_VARIANTS.map((v) => {
                const m = ALERT_META[v]
                return (
                  <button
                    key={v}
                    type="button"
                    className={`nota-variante-chip${variant === v ? " is-active" : ""}`}
                    onClick={() => updateProps(editor, block.id, { variant: v })}
                    title={m.label}
                  >
                    <span aria-hidden="true">{m.icon}</span>
                    {m.short}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )
    },
  }
)
