"use client"

import { createReactBlockSpec } from "@blocknote/react"
import { BlockField, updateProps } from "./shared"

export const createTextFigure = createReactBlockSpec(
  {
    type: "textFigure",
    propSchema: {
      imageUrl: { default: "" },
      caption: { default: "" },
    },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => {
      const readOnly = !editor.isEditable
      return (
        <div className="cb-columns cb-columns-2">
          <div ref={contentRef} className="cb-paragraph min-h-[4rem]" />
          <div>
            {!readOnly && (
              <input
                type="url"
                value={block.props.imageUrl}
                onChange={(e) =>
                  updateProps(editor, block.id, { imageUrl: e.target.value })
                }
                placeholder="URL da imagem"
                className="mb-2 w-full rounded border border-slate-200 px-2 py-1 text-sm"
              />
            )}
            {block.props.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={block.props.imageUrl}
                alt={block.props.caption || "Figura"}
                className="max-h-48 w-full rounded-lg border border-[var(--cb-border)] object-cover"
              />
            ) : (
              <div className="cb-sketch">Sem imagem</div>
            )}
            <BlockField
              value={block.props.caption}
              readOnly={readOnly}
              placeholder="Legenda"
              className="mt-2 text-xs text-slate-500"
              onChange={(caption) => updateProps(editor, block.id, { caption })}
            />
          </div>
        </div>
      )
    },
  }
)
