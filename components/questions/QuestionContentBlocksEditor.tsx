"use client"

import { Fragment, useState } from "react"
import { ImageIcon, Loader2, Plus, Trash2, Type } from "lucide-react"
import RichTextEditor from "@/components/RichTextEditor"
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
  onChange: (content: string) => void
  onRemove: () => void
  uploading: boolean
  onUpload: (file: File) => Promise<string | null>
}

function BlockEditor({
  block,
  onChange,
  onRemove,
  uploading,
  onUpload,
}: BlockEditorProps) {
  async function handleFile(file: File) {
    const url = await onUpload(file)
    if (url) onChange(url)
  }

  if (block.kind === "image") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Imagem
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
        {block.content.trim() ? (
          <img
            src={block.content}
            alt=""
            className="mb-2 max-h-48 w-full rounded border object-contain bg-white"
          />
        ) : (
          <p className="mb-2 text-xs text-slate-500">
            Envie um arquivo ou cole um print (Ctrl+V) nesta área.
          </p>
        )}
        <div
          className="rounded-lg border border-dashed border-slate-300 bg-white p-3"
          onPaste={async (e) => {
            const file = [...(e.clipboardData?.files ?? [])].find((f) =>
              f.type.startsWith("image/")
            )
            if (!file) return
            e.preventDefault()
            await handleFile(file)
          }}
        >
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            className="w-full text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
            }}
          />
          {uploading && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Enviando…
            </p>
          )}
        </div>
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
        onChange={onChange}
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
  onUpload: (file: File) => Promise<string | null>
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

  function updateBlock(id: string, content: string) {
    onChange(blocks.map((b) => (b.id === id ? { ...b, content } : b)))
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
            onChange={(c) => updateBlock(block.id, c)}
            onRemove={() => removeBlock(block.id)}
            uploading={uploadingBlockId === block.id}
            onUpload={async (file) => {
              const url = await onUpload(file)
              if (url) updateBlock(block.id, url)
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
        onUpload={(file) => uploadImage(file)}
        onChange={(before) => onChange({ ...blocks, before })}
      />

      <label className="block border-y border-violet-200 bg-violet-50/40 py-3 text-sm">
        <span className="mb-1 block px-1 font-semibold text-violet-900">Enunciado</span>
        <textarea
          value={statement}
          onChange={(e) => onStatementChange(e.target.value)}
          rows={5}
          className="mx-1 w-[calc(100%-0.5rem)] rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
          placeholder="Pergunta principal (fica no centro da sequência)"
        />
      </label>

      <BlockSection
        title="Abaixo do enunciado"
        blocks={blocks.after}
        uploadingBlockId={uploadingBlockId}
        onUpload={(file) => uploadImage(file)}
        onChange={(after) => onChange({ ...blocks, after })}
      />
    </div>
  )
}
