"use client"

import { createReactBlockSpec } from "@blocknote/react"

export const createHeadingLine = createReactBlockSpec(
  {
    type: "headingLine",
    propSchema: {},
    content: "inline",
  },
  {
    render: ({ contentRef }) => (
      <div className="cb-block">
        <div ref={contentRef} className="titulo-linha min-h-[1.5rem]" />
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
        <div ref={contentRef} className="titulo-fundo min-h-[1.25rem]" />
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
        <div className="cb-block subtitulo-numerado">
          <span className="num">
            {readOnly ? (
              block.props.number
            ) : (
              <input
                className="cb-field w-6 bg-transparent text-center text-[0.85rem] font-bold text-[var(--cb-paper)]"
                value={block.props.number}
                onChange={(e) =>
                  editor.updateBlock(block.id, {
                    props: { number: e.target.value },
                  })
                }
              />
            )}
          </span>
          <div ref={contentRef} className="min-h-[1.25rem] flex-1" />
        </div>
      )
    },
  }
)
