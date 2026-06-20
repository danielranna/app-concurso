"use client"

import { useState } from "react"
import { createReactBlockSpec } from "@blocknote/react"
import { updateProps } from "./shared"

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
        <div
          className={`flashcard${flipped ? " is-flipped" : ""}`}
          onClick={() => setFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              setFlipped((f) => !f)
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="flashcard-inner">
            <div className="flashcard-face frente">
              <span className="flashcard-eyebrow">Pergunta</span>
              {readOnly ? (
                <p className="m-0 font-semibold">{block.props.front || "—"}</p>
              ) : (
                <textarea
                  className="cb-field cb-field-multiline m-0 w-full font-semibold"
                  value={block.props.front}
                  placeholder="Frente do cartão"
                  rows={3}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    updateProps(editor, block.id, { front: e.target.value })
                  }
                />
              )}
              <span className="flashcard-hint">Clique para virar</span>
            </div>
            <div className="flashcard-face verso">
              <span className="flashcard-eyebrow">Resposta</span>
              {readOnly ? (
                <p className="resposta m-0">{block.props.back || "—"}</p>
              ) : (
                <textarea
                  className="cb-field cb-field-multiline resposta m-0 w-full"
                  value={block.props.back}
                  placeholder="Verso do cartão"
                  rows={3}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    updateProps(editor, block.id, { back: e.target.value })
                  }
                />
              )}
            </div>
          </div>
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
        <div className="flashcard-estatico">
          {readOnly ? (
            <h4>{block.props.title || "Resumo"}</h4>
          ) : (
            <input
              className="cb-field mb-2 w-full font-semibold"
              value={block.props.title}
              placeholder="Título"
              onChange={(e) =>
                updateProps(editor, block.id, { title: e.target.value })
              }
            />
          )}
          {readOnly ? (
            <p className="m-0 text-[var(--cb-ink-soft)]">{block.props.body}</p>
          ) : (
            <textarea
              className="cb-field cb-field-multiline w-full text-[var(--cb-ink-soft)]"
              value={block.props.body}
              placeholder="Conteúdo do resumo"
              rows={3}
              onChange={(e) =>
                updateProps(editor, block.id, { body: e.target.value })
              }
            />
          )}
        </div>
      )
    },
  }
)
