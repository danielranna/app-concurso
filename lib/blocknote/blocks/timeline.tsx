"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { parseJsonProp, stringifyJsonProp } from "../helpers"
import { BlockActions, BlockField, SmallButton, updateProps } from "./shared"

type TimelineItem = { date: string; content: string }

export const createTimeline = createReactBlockSpec(
  {
    type: "timeline",
    propSchema: {
      itemsJson: { default: "[]" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const readOnly = !editor.isEditable
      const items = parseJsonProp<TimelineItem[]>(block.props.itemsJson, [])
      const setItems = (next: TimelineItem[]) =>
        updateProps(editor, block.id, { itemsJson: stringifyJsonProp(next) })

      return (
        <div className="cb-timeline">
          {items.map((item, i) => (
            <div key={i} className="cb-timeline-item">
              <div className="cb-timeline-date">
                <BlockField
                  value={item.date}
                  readOnly={readOnly}
                  placeholder="Data / período"
                  className="cb-field uppercase tracking-wide"
                  onChange={(date) => {
                    const next = [...items]
                    next[i] = { ...next[i], date }
                    setItems(next)
                  }}
                />
              </div>
              <BlockField
                value={item.content}
                readOnly={readOnly}
                multiline
                placeholder="Conteúdo"
                className="cb-field"
                onChange={(content) => {
                  const next = [...items]
                  next[i] = { ...next[i], content }
                  setItems(next)
                }}
              />
            </div>
          ))}
          <BlockActions readOnly={readOnly}>
            <SmallButton
              onClick={() => setItems([...items, { date: "", content: "" }])}
            >
              + item
            </SmallButton>
            {items.length > 0 && (
              <SmallButton onClick={() => setItems(items.slice(0, -1))}>
                − item
              </SmallButton>
            )}
          </BlockActions>
        </div>
      )
    },
  }
)
