"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { parseJsonProp, stringifyJsonProp } from "../helpers"
import { BlockActions, BlockField, SmallButton, updateProps } from "./shared"

type MiniCard = { title: string; body: string }

export const createMiniCards = createReactBlockSpec(
  {
    type: "miniCards",
    propSchema: {
      cardsJson: { default: "[]" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const readOnly = !editor.isEditable
      const cards = parseJsonProp<MiniCard[]>(block.props.cardsJson, [])
      const setCards = (next: MiniCard[]) =>
        updateProps(editor, block.id, { cardsJson: stringifyJsonProp(next) })

      return (
        <div className="cb-columns cb-columns-2">
          {cards.map((card, i) => (
            <div key={i} className="cb-mini-card">
              <div className="cb-mini-card-title">
                <BlockField
                  value={card.title}
                  readOnly={readOnly}
                  placeholder="Título"
                  onChange={(title) => {
                    const next = [...cards]
                    next[i] = { ...next[i], title }
                    setCards(next)
                  }}
                />
              </div>
              <BlockField
                value={card.body}
                readOnly={readOnly}
                multiline
                placeholder="Conteúdo"
                className="cb-paragraph"
                onChange={(body) => {
                  const next = [...cards]
                  next[i] = { ...next[i], body }
                  setCards(next)
                }}
              />
            </div>
          ))}
          <BlockActions readOnly={readOnly}>
            <SmallButton
              onClick={() => setCards([...cards, { title: "", body: "" }])}
            >
              + card
            </SmallButton>
            {cards.length > 0 && (
              <SmallButton onClick={() => setCards(cards.slice(0, -1))}>
                − card
              </SmallButton>
            )}
          </BlockActions>
        </div>
      )
    },
  }
)
