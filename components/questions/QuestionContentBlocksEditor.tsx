"use client"

import { Fragment, useState } from "react"
import { ImageIcon, Plus, Trash2, Type } from "lucide-react"
import RichTextEditor from "@/components/RichTextEditor"
import ImagePasteZone from "@/components/questions/ImagePasteZone"
import ResizableQuestionImage from "@/components/questions/ResizableQuestionImage"
import type {
  QuestionContentBlock,
  QuestionContentBlockKind,
  QuestionContentBlocks,
} from "@/lib/question-content-blocks"
import { newBlockId } from "@/lib/question-content-blocks"

type AddSlotProps = {
  label: string
  onAdd: (kind: QuestionContentBlockKind) => void
  disabled?: boolean
}

function AddBlockSlot({ label, onAdd, disabled }: AddSlotProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative flex justify-center py-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40"
        title={label}
        aria-label={label}
      >
        <Plus className="h-4 w-4" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            aria-label="Fechar"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full z-20 mt-1 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                onAdd("text")
                setOpen(false)
              }}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <Type className="h-3.5 w-3.5" />
              Texto
            </button>
            <button
              type="button"
              onClick={() => {
                onAdd("image")
                setOpen(false)
              }}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Imagem
            </button>
          </div>
        </>
      )}
    </div>
  )
}

type BlockEditorProps = {
  block: QuestionContentBlock
  onPatch: (patch: Partial<QuestionContentBlock>) => void
  onRemove: () => void
  uploading: boolean
  onUpload: (file: File) => Promise<string | null>
}

function BlockEditor({
  block,
  onPatch,
  onRemove,
  uploading,
  onUpload,
}: BlockEditorProps) {
  const [replacing, setReplacing] = useState(false)
  const hasImage = block.kind === "image" && !!block.content.trim()

  if (block.kind === "image") {
    return (
      <div className="py-1">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Imagem</span>
          <button
            type="button"
            onClick={onRemove}
            className="text-red-500 hover:text-red-700"
            title="Remover bloco"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {hasImage && !replacing ? (
          <>
            <ResizableQuestionImage
              src={block.content}
              widthPct={block.widthPct}
              editable
              onWidthChange={(widthPct) => onPatch({ widthPct })}
            />
            <button
              type="button"
              onClick={() => setReplacing(true)}
              className="mt-1 text-xs text-violet-700 hover:underline"
            >
              Substituir imagem (Ctrl+V)
            </button>
          </>
        ) : (
          <ImagePasteZone
            uploading={uploading}
            autoFocus
            onPasteImage={async (file) => {
              const url = await onUpload(file)
              if (url) {
                onPatch({ content: url, widthPct: block.widthPct ?? 45 })
                setReplacing(false)
              }
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Texto
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-red-500 hover:text-red-700"
          title="Remover bloco"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <RichTextEditor
        value={block.content}
        onChange={(content) => onPatch({ content })}
        rows={3}
        placeholder="Texto formatado — pode colar print (Ctrl+V)"
        onImageUpload={onUpload}
      />
    </div>
  )
}

type SectionProps = {
  title: string
  blocks: QuestionContentBlock[]
  uploadingBlockId: string | null
  onUpload: (blockId: string, file: File) => Promise<string | null>
  onChange: (blocks: QuestionContentBlock[]) => void
}

function BlockSection({
  title,
  blocks,
  uploadingBlockId,
  onUpload,
  onChange,
}: SectionProps) {
  function insertAt(index: number, kind: QuestionContentBlockKind) {
    const next = [...blocks]
    next.splice(index, 0, { id: newBlockId(), kind, content: "" })
    onChange(next)
  }

  function patchBlock(id: string, patch: Partial<QuestionContentBlock>) {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function removeBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id))
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500">{title}</p>
      <AddBlockSlot label={`Adicionar bloco — ${title}`} onAdd={(k) => insertAt(0, k)} />
      {blocks.map((block, i) => (
        <Fragment key={block.id}>
          <BlockEditor
            block={block}
            onPatch={(patch) => patchBlock(block.id, patch)}
            onRemove={() => removeBlock(block.id)}
            uploading={uploadingBlockId === block.id}
            onUpload={async (file) => {
              const url = await onUpload(block.id, file)
              if (url) patchBlock(block.id, { content: url })
              return url
            }}
          />
          <AddBlockSlot
            label={`Adicionar bloco abaixo — ${title}`}
            onAdd={(k) => insertAt(i + 1, k)}
          />
        </Fragment>
      ))}
    </div>
  )
}

export default function QuestionContentBlocksEditor({
  blocks,
  onChange,
  userId,
  statement,
  onStatementChange,
}: {
  blocks: QuestionContentBlocks
  onChange: (blocks: QuestionContentBlocks) => void
  userId: string
  statement: string
  onStatementChange: (v: string) => void
}) {
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null)

  async function uploadImage(file: File): Promise<string | null> {
    const form = new FormData()
    form.append("user_id", userId)
    form.append("file", file)
    const res = await fetch("/api/questions/upload", { method: "POST", body: form })
    const data = await res.json()
    if (!res.ok) return null
    return data.url as string
  }

  async function uploadForBlock(blockId: string, file: File) {
    setUploadingBlockId(blockId)
    try {
      return await uploadImage(file)
    } finally {
      setUploadingBlockId(null)
    }
  }

  return (
    <div className="space-y-2">
      <BlockSection
        title="Acima do enunciado"
        blocks={blocks.before}
        uploadingBlockId={uploadingBlockId}
        onUpload={uploadForBlock}
        onChange={(before) => onChange({ ...blocks, before })}
      />

      <label className="block border-y border-violet-200 bg-violet-50/40 py-3 text-sm">
        <span className="mb-1 block px-1 font-semibold text-violet-900">Enunciado</span>
        <div className="mx-1 w-[calc(100%-0.5rem)]">
          <RichTextEditor
          value={statement}
          onChange={onStatementChange}
          rows={5}
          placeholder="Pergunta principal (fica no centro da sequência)"
          />
        </div>
      </label>

      <BlockSection
        title="Abaixo do enunciado"
        blocks={blocks.after}
        uploadingBlockId={uploadingBlockId}
        onUpload={uploadForBlock}
        onChange={(after) => onChange({ ...blocks, after })}
      />
    </div>
  )
}
