"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import type { QuestionContentBlock, QuestionContentBlocks } from "@/lib/question-content-blocks"
import { isImageContent } from "@/lib/question-content-blocks"
import type { ResolvedSharedBlock } from "@/lib/shared-assets"
import ResizableQuestionImage from "@/components/questions/ResizableQuestionImage"

function SingleBlock({ block }: { block: QuestionContentBlock }) {
  const content = block.content.trim()
  if (!content) return null

  if (block.kind === "image" || isImageContent(content)) {
    return <ResizableQuestionImage src={content} widthPct={block.widthPct} />
  }

  if (content.includes("<")) {
    return (
      <div
        className="prose prose-sm max-w-none text-slate-800 [&_img]:my-2 [&_img]:block [&_img]:h-auto [&_img]:max-w-full"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    )
  }

  return <div className="whitespace-pre-wrap text-slate-700">{content}</div>
}

function renderStatement(statement: string, statementClassName: string) {
  if (statement.includes("<")) {
    return (
      <div
        className={`${statementClassName} prose prose-sm max-w-none [&_img]:my-2 [&_img]:block [&_img]:h-auto [&_img]:max-w-full`}
        dangerouslySetInnerHTML={{ __html: statement }}
      />
    )
  }

  return <div className={statementClassName}>{statement}</div>
}

export function QuestionContentBlockList({
  blocks,
  className = "",
}: {
  blocks: QuestionContentBlock[]
  className?: string
}) {
  if (!blocks.length) return null
  return (
    <div className={`space-y-3 ${className}`}>
      {blocks.map((block) => (
        <SingleBlock key={block.id} block={block} />
      ))}
    </div>
  )
}

function sharedBlockKindLabel(kind: ResolvedSharedBlock["kind"]) {
  return kind === "image" ? "Imagem" : "Texto"
}

function SharedBlockBody({ block }: { block: ResolvedSharedBlock }) {
  if (block.kind === "image") {
    return <ResizableQuestionImage src={block.content} widthPct={block.widthPct} />
  }

  return (
    <>
      {block.title && (
        <p className="mb-2 text-sm font-semibold text-slate-900">{block.title}</p>
      )}
      {block.content.includes("<") ? (
        <div
          className="prose prose-sm max-w-none text-slate-800 [&_mark]:rounded [&_mark]:bg-yellow-200 [&_mark]:px-0.5 [&_img]:my-2 [&_img]:block [&_img]:h-auto [&_img]:max-w-full"
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      ) : (
        <div className="whitespace-pre-wrap text-slate-700">{block.content}</div>
      )}
      {block.fonte?.trim() && (
        <p className="mt-3 border-t border-slate-200 pt-2 text-xs italic text-slate-500">
          {block.fonte.trim()}
        </p>
      )}
    </>
  )
}

function SharedBlockItem({ block }: { block: ResolvedSharedBlock }) {
  if (block.kind === "image") {
    return (
      <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
        <SharedBlockBody block={block} />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
      <SharedBlockBody block={block} />
    </div>
  )
}

function CollapsibleSharedBlockItem({ block }: { block: ResolvedSharedBlock }) {
  const [open, setOpen] = useState(true)
  const kindLabel = sharedBlockKindLabel(block.kind)

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-slate-800">
          {kindLabel} {block.label}:
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
          {open ? "Ocultar" : "Mostrar"}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-200 px-4 pb-4 pt-3">
          <SharedBlockBody block={block} />
        </div>
      )}
    </div>
  )
}

/** Pré-visualização compacta com altura fixa e scroll. */
export function SharedContentPreview({
  blocks,
  className = "",
  maxHeightClass = "max-h-36",
}: {
  blocks: ResolvedSharedBlock[]
  className?: string
  maxHeightClass?: string
}) {
  if (!blocks.length) return null
  return (
    <div
      className={`overflow-y-auto rounded border border-slate-100 bg-slate-50/80 p-2 ${maxHeightClass} ${className}`}
    >
      <SharedContentBlockList blocks={blocks} />
    </div>
  )
}

export function SharedContentBlockList({
  blocks,
  className = "",
  studyMode = false,
}: {
  blocks: ResolvedSharedBlock[]
  className?: string
  studyMode?: boolean
}) {
  if (!blocks.length) return null
  const Item = studyMode ? CollapsibleSharedBlockItem : SharedBlockItem
  return (
    <div className={`space-y-4 ${className}`}>
      {blocks.map((block) => (
        <Item key={block.id} block={block} />
      ))}
    </div>
  )
}

export default function QuestionContentDisplay({
  blocks,
  sharedBlocks = [],
  statement,
  statementClassName = "mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-800",
  studyMode = false,
}: {
  blocks: QuestionContentBlocks
  sharedBlocks?: ResolvedSharedBlock[]
  statement: string
  statementClassName?: string
  /** Modo estudo: cabeçalho "Texto [rótulo]:" com toggle para ocultar */
  studyMode?: boolean
}) {
  return (
    <>
      <SharedContentBlockList blocks={sharedBlocks} studyMode={studyMode} />
      <QuestionContentBlockList blocks={blocks.before} className={sharedBlocks.length ? "mt-4" : ""} />
      {renderStatement(statement, statementClassName)}
      <QuestionContentBlockList blocks={blocks.after} className="mt-3" />
    </>
  )
}
