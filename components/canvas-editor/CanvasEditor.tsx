"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react"
import type { CanvasBlock, CanvasDocument, BlockType } from "@/lib/canvas-blocks/types"
import { BLOCK_REGISTRY, createBlock } from "@/lib/canvas-blocks/registry"
import { duplicateBlock, moveBlock } from "@/lib/canvas-blocks/patch"
import CanvasDocumentRenderer from "@/components/canvas-blocks/CanvasDocumentRenderer"

type Props = {
  document: CanvasDocument
  onChange: (doc: CanvasDocument) => void
  readOnly?: boolean
}

export default function CanvasEditor({ document: doc, onChange, readOnly = false }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const updateBlock = useCallback(
    (blockId: string, props: Record<string, unknown>) => {
      onChange({
        ...doc,
        blocks: doc.blocks.map((b) =>
          b.id === blockId ? { ...b, props: { ...b.props, ...props } } : b
        ),
      })
    },
    [doc, onChange]
  )

  function addBlock(type: BlockType) {
    const block = createBlock(type) as CanvasBlock
    onChange({ ...doc, blocks: [...doc.blocks, block] })
    setMenuOpen(false)
  }

  function removeBlock(id: string) {
    onChange({ ...doc, blocks: doc.blocks.filter((b) => b.id !== id) })
  }

  function moveUp(index: number) {
    if (index <= 0) return
    onChange({ ...doc, blocks: moveBlock(doc.blocks, index, index - 1) })
  }

  function moveDown(index: number) {
    if (index >= doc.blocks.length - 1) return
    onChange({ ...doc, blocks: moveBlock(doc.blocks, index, index + 1) })
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  if (readOnly) {
    return <CanvasDocumentRenderer blocks={doc.blocks} />
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Adicionar bloco
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {BLOCK_REGISTRY.map((meta) => (
                <button
                  key={meta.type}
                  type="button"
                  onClick={() => addBlock(meta.type)}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  {meta.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {doc.blocks.map((block, index) => (
          <div
            key={block.id}
            className="group relative rounded-lg border border-transparent hover:border-slate-200 hover:bg-white/80"
          >
            <div className="absolute -left-1 top-2 z-10 flex flex-col gap-0.5 opacity-0 transition group-hover:opacity-100">
              <button
                type="button"
                onClick={() => moveUp(index)}
                className="rounded bg-white p-1 shadow border border-slate-200 text-slate-500 hover:text-slate-800"
                title="Mover para cima"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => moveDown(index)}
                className="rounded bg-white p-1 shadow border border-slate-200 text-slate-500 hover:text-slate-800"
                title="Mover para baixo"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...doc,
                    blocks: [
                      ...doc.blocks.slice(0, index + 1),
                      duplicateBlock(block),
                      ...doc.blocks.slice(index + 1),
                    ],
                  })
                }
                className="rounded bg-white p-1 shadow border border-slate-200 text-slate-500 hover:text-slate-800"
                title="Duplicar"
              >
                <Copy className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => removeBlock(block.id)}
                className="rounded bg-white p-1 shadow border border-slate-200 text-red-500 hover:text-red-700"
                title="Remover"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <div className="pl-6 pr-2 py-1">
              <CanvasDocumentRenderer
                blocks={[block]}
                editable
                onBlockChange={updateBlock}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
