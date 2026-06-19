"use client"

import { useState } from "react"
import { createReactBlockSpec } from "@blocknote/react"
import { BlockField, updateProps } from "./shared"

export const createFlashcardFlip = createReactBlockSpec(
  {
    type: "flashcardFlip",
    propSchema: {
      front: { default: "" },
      back: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const readOnly = !editor.isEditable
      const [flipped, setFlipped] = useState(false)

      return (
        <div className="cb-mini-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Flashcard
            </span>
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="text-xs text-violet-700 hover:underline"
            >
              {flipped ? "Ver frente" : "Virar"}
            </button>
          </div>
          {!flipped ? (
            <BlockField
              value={block.props.front}
              readOnly={readOnly}
              multiline
              placeholder="Frente"
              onChange={(front) => updateProps(editor, block.id, { front })}
            />
          ) : (
            <BlockField
              value={block.props.back}
              readOnly={readOnly}
              multiline
              placeholder="Verso"
              onChange={(back) => updateProps(editor, block.id, { back })}
            />
          )}
        </div>
      )
    },
  }
)

export const createFlashcardStatic = createReactBlockSpec(
  {
    type: "flashcardStatic",
    propSchema: {
      title: { default: "" },
      body: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const readOnly = !editor.isEditable
      return (
        <div className="cb-mini-card border-l-4 border-l-[var(--cb-purple)]">
          <div className="cb-mini-card-title">
            <BlockField
              value={block.props.title}
              readOnly={readOnly}
              placeholder="Título"
              onChange={(title) => updateProps(editor, block.id, { title })}
            />
          </div>
          <BlockField
            value={block.props.body}
            readOnly={readOnly}
            multiline
            placeholder="Resumo"
            className="cb-paragraph"
            onChange={(body) => updateProps(editor, block.id, { body })}
          />
        </div>
      )
    },
  }
)
