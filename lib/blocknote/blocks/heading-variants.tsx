"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { BlockField, updateProps } from "./shared"

export const createHeadingLine = createReactBlockSpec(
  {
    type: "headingLine",
    propSchema: {},
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => (
      <div className="cb-block">
        <div
          ref={contentRef}
          className="cb-heading-1 min-h-[1.5rem] border-b border-[var(--cb-border)] pb-2"
        />
      </div>
    ),
  }
)

export const createHeadingChip = createReactBlockSpec(
  {
    type: "headingChip",
    propSchema: {},
    content: "inline",
  },
  {
    render: ({ contentRef }) => (
      <div className="cb-block">
        <div
          ref={contentRef}
          className="inline-block rounded-lg bg-[var(--cb-gold-bg)] px-3 py-1 text-base font-semibold text-[var(--cb-ink)]"
        />
      </div>
    ),
  }
)

export const createHeadingNumbered = createReactBlockSpec(
  {
    type: "headingNumbered",
    propSchema: {
      number: { default: "1" },
    },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => {
      const readOnly = !editor.isEditable
      return (
        <div className="cb-block flex items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cb-blue-bg)] text-sm font-bold text-[var(--cb-blue)]">
            <BlockField
              value={block.props.number}
              readOnly={readOnly}
              className="w-7 text-center text-sm font-bold"
              onChange={(number) => updateProps(editor, block.id, { number })}
            />
          </span>
          <div ref={contentRef} className="cb-heading-3 min-h-[1.25rem] flex-1" />
        </div>
      )
    },
  }
)
