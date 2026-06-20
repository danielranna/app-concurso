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
        <div className="colunas-2">
          <div ref={contentRef} className="nota-corpo min-h-[4rem]" />
          <figure className="figura-ficticia m-0">
            {!readOnly && (
              <input
                type="url"
                value={block.props.imageUrl}
                onChange={(e) =>
                  updateProps(editor, block.id, { imageUrl: e.target.value })
                }
                placeholder="URL da imagem"
                className="cb-field mb-2 w-full rounded-md border border-[var(--cb-paper-line)] bg-[var(--cb-paper)] px-2 py-1.5 text-sm"
              />
            )}
            {block.props.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={block.props.imageUrl}
                alt={block.props.caption || "Figura"}
              />
            ) : (
              <div className="cb-sketch flex min-h-[140px] items-center justify-center text-sm text-[var(--cb-ink-faint)]">
                Cole a URL ou use /imagem
              </div>
            )}
            <figcaption className="figura-legenda">
              <BlockField
                value={block.props.caption}
                readOnly={readOnly}
                placeholder="Legenda da figura"
                className="cb-field text-center text-xs"
                onChange={(caption) => updateProps(editor, block.id, { caption })}
              />
            </figcaption>
          </figure>
        </div>
      )
    },
  }
)
