"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { parseJsonProp, stringifyJsonProp } from "../helpers"
import { BlockActions, BlockField, SmallButton, updateProps } from "./shared"

type BarItem = { label: string; value: number }

export const createBarChart = createReactBlockSpec(
  {
    type: "barChart",
    propSchema: {
      title: { default: "" },
      itemsJson: { default: "[]" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const readOnly = !editor.isEditable
      const items = parseJsonProp<BarItem[]>(block.props.itemsJson, [])
      const max = Math.max(...items.map((i) => i.value), 1)
      const setItems = (next: BarItem[]) =>
        updateProps(editor, block.id, { itemsJson: stringifyJsonProp(next) })

      return (
        <div>
          <BlockField
            value={block.props.title}
            readOnly={readOnly}
            placeholder="Título do gráfico"
            className="cb-field mb-3 w-full font-semibold"
            onChange={(title) => updateProps(editor, block.id, { title })}
          />
          <div className="canvas-card cb-bar-chart !min-h-[160px] !items-end !p-4">
            {items.map((item, i) => (
              <div key={i} className="cb-bar-col">
                <div
                  className="cb-bar"
                  style={{ height: `${Math.max(4, (item.value / max) * 100)}%` }}
                />
                <BlockField
                  value={item.label}
                  readOnly={readOnly}
                  className="cb-bar-label w-full text-center"
                  onChange={(label) => {
                    const next = [...items]
                    next[i] = { ...next[i], label }
                    setItems(next)
                  }}
                />
                {!readOnly && (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={item.value}
                    onChange={(e) => {
                      const next = [...items]
                      next[i] = {
                        ...next[i],
                        value: Number(e.target.value) || 0,
                      }
                      setItems(next)
                    }}
                    className="cb-field cb-bar-value w-12 text-center text-xs"
                  />
                )}
              </div>
            ))}
          </div>
          <BlockActions readOnly={readOnly}>
            <SmallButton
              onClick={() => setItems([...items, { label: "", value: 50 }])}
            >
              + barra
            </SmallButton>
            {items.length > 0 && (
              <SmallButton onClick={() => setItems(items.slice(0, -1))}>
                − barra
              </SmallButton>
            )}
          </BlockActions>
        </div>
      )
    },
  }
)
