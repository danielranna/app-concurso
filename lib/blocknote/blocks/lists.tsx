"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { parseJsonProp, stringifyJsonProp } from "../helpers"
import { BlockActions, BlockField, SmallButton, updateProps } from "./shared"

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
        <ul className="list-none space-y-2 pl-0">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 text-[var(--cb-blue)]">→</span>
              <BlockField
                value={item}
                readOnly={readOnly}
                placeholder="Item"
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
      const items = parseJsonProp<{ text: string; level: "alta" | "media" | "baixa" }[]>(
        block.props.itemsJson,
        []
      )
      const setItems = (
        next: { text: string; level: "alta" | "media" | "baixa" }[]
      ) => updateProps(editor, block.id, { itemsJson: stringifyJsonProp(next) })

      const levelClass = {
        alta: "bg-[var(--cb-red-bg)] text-[var(--cb-red)]",
        media: "bg-[var(--cb-yellow-bg)] text-[var(--cb-yellow)]",
        baixa: "bg-[var(--cb-green-bg)] text-[var(--cb-green)]",
      }

      return (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              {!readOnly ? (
                <select
                  value={item.level}
                  onChange={(e) => {
                    const next = [...items]
                    next[i] = {
                      ...next[i],
                      level: e.target.value as "alta" | "media" | "baixa",
                    }
                    setItems(next)
                  }}
                  className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                </select>
              ) : (
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${levelClass[item.level]}`}
                >
                  {item.level}
                </span>
              )}
              <BlockField
                value={item.text}
                readOnly={readOnly}
                className="flex-1"
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
