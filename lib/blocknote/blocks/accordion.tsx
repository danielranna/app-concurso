"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { parseJsonProp, stringifyJsonProp } from "../helpers"
import { BlockActions, BlockField, SmallButton, updateProps } from "./shared"

type AccordionItem = { title: string; body: string }

export const createStudyAccordion = createReactBlockSpec(
  {
    type: "studyAccordion",
    propSchema: {
      itemsJson: { default: "[]" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const readOnly = !editor.isEditable
      const items = parseJsonProp<AccordionItem[]>(block.props.itemsJson, [])
      const setItems = (next: AccordionItem[]) =>
        updateProps(editor, block.id, { itemsJson: stringifyJsonProp(next) })

      return (
        <div className="cb-accordion">
          {items.map((item, i) => (
            <details key={i} className="accordion-item" open={i === 0}>
              <summary>
                <span className="pergunta-marca">Q{i + 1}</span>
                <BlockField
                  value={item.title}
                  readOnly={readOnly}
                  placeholder="Título da seção"
                  className="cb-field flex-1 font-semibold"
                  onChange={(title) => {
                    const next = [...items]
                    next[i] = { ...next[i], title }
                    setItems(next)
                  }}
                />
              </summary>
              <div className="accordion-conteudo">
                <BlockField
                  value={item.body}
                  readOnly={readOnly}
                  multiline
                  placeholder="Conteúdo"
                  className="cb-field cb-field-multiline"
                  onChange={(body) => {
                    const next = [...items]
                    next[i] = { ...next[i], body }
                    setItems(next)
                  }}
                />
              </div>
            </details>
          ))}
          <BlockActions readOnly={readOnly}>
            <SmallButton
              onClick={() => setItems([...items, { title: "", body: "" }])}
            >
              + seção
            </SmallButton>
          </BlockActions>
        </div>
      )
    },
  }
)

export const createStudySection = createReactBlockSpec(
  {
    type: "studySection",
    propSchema: {
      title: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const readOnly = !editor.isEditable
      return (
        <div className="cb-section-title">
          <BlockField
            value={block.props.title}
            readOnly={readOnly}
            placeholder="Seção"
            className="cb-field font-bold uppercase tracking-widest"
            onChange={(title) => updateProps(editor, block.id, { title })}
          />
        </div>
      )
    },
  }
)
