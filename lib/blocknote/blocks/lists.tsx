"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { parseJsonProp, stringifyJsonProp } from "../helpers"
import { BlockActions, BlockField, SmallButton, updateProps } from "./shared"

const PRIORITY_LEVELS = ["alta", "media", "baixa"] as const
type PriorityLevel = (typeof PRIORITY_LEVELS)[number]

const levelLabel: Record<PriorityLevel, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
}

export const createArrowList = createReactBlockSpec(
  {
    type: "arrowList",
    propSchema: {
      itemsJson: { default: "[]" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const readOnly = !editor.isEditable
      const items = parseJsonProp<string[]>(block.props.itemsJson, [])
      const setItems = (next: string[]) =>
        updateProps(editor, block.id, { itemsJson: stringifyJsonProp(next) })

      return (
        <ul className="lista-setas">
          {items.map((item, i) => (
            <li key={i}>
              <BlockField
                value={item}
                readOnly={readOnly}
                placeholder="Item"
                className="cb-field flex-1"
                onChange={(v) => {
                  const next = [...items]
                  next[i] = v
                  setItems(next)
                }}
              />
            </li>
          ))}
          <BlockActions readOnly={readOnly}>
            <SmallButton onClick={() => setItems([...items, ""])}>
              + item
            </SmallButton>
            {items.length > 0 && (
              <SmallButton onClick={() => setItems(items.slice(0, -1))}>
                − item
              </SmallButton>
            )}
          </BlockActions>
        </ul>
      )
    },
  }
)

export const createPriorityList = createReactBlockSpec(
  {
    type: "priorityList",
    propSchema: {
      itemsJson: { default: "[]" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const readOnly = !editor.isEditable
      const items = parseJsonProp<{ text: string; level: PriorityLevel }[]>(
        block.props.itemsJson,
        []
      )
      const setItems = (next: { text: string; level: PriorityLevel }[]) =>
        updateProps(editor, block.id, { itemsJson: stringifyJsonProp(next) })

      return (
        <ul className="lista-prioridade">
          {items.map((item, i) => (
            <li key={i}>
              {readOnly ? (
                <span className={`prioridade-badge prioridade-${item.level}`}>
                  {levelLabel[item.level]}
                </span>
              ) : (
                <div className="prioridade-picker">
                  {PRIORITY_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={`prioridade-badge prioridade-${level}${item.level === level ? " is-active" : ""}`}
                      onClick={() => {
                        const next = [...items]
                        next[i] = { ...next[i], level }
                        setItems(next)
                      }}
                    >
                      {levelLabel[level]}
                    </button>
                  ))}
                </div>
              )}
              <BlockField
                value={item.text}
                readOnly={readOnly}
                placeholder="Descrição"
                className="cb-field flex-1"
                onChange={(text) => {
                  const next = [...items]
                  next[i] = { ...next[i], text }
                  setItems(next)
                }}
              />
            </li>
          ))}
          <BlockActions readOnly={readOnly}>
            <SmallButton
              onClick={() =>
                setItems([...items, { text: "", level: "media" }])
              }
            >
              + item
            </SmallButton>
            {items.length > 0 && (
              <SmallButton onClick={() => setItems(items.slice(0, -1))}>
                − item
              </SmallButton>
            )}
          </BlockActions>
        </ul>
      )
    },
  }
)
