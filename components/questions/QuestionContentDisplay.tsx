"use client"

import type { QuestionContentBlock, QuestionContentBlocks } from "@/lib/question-content-blocks"
import { isImageContent } from "@/lib/question-content-blocks"

function SingleBlock({ block }: { block: QuestionContentBlock }) {
  const content = block.content.trim()
  if (!content) return null

  if (block.kind === "image" || isImageContent(content)) {
    return (
      <img
        src={content}
        alt=""
        className="my-3 max-h-[28rem] w-full rounded-lg border object-contain"
      />
    )
  }

  if (content.includes("<")) {
    return (
      <div
        className="prose prose-sm max-w-none text-slate-800 [&_img]:my-3 [&_img]:max-h-[28rem] [&_img]:w-full [&_img]:rounded-lg [&_img]:border [&_img]:object-contain"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    )
  }

  return <div className="whitespace-pre-wrap text-slate-700">{content}</div>
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

export default function QuestionContentDisplay({
  blocks,
  statement,
  statementClassName = "mt-3 whitespace-pre-wrap text-base leading-relaxed text-slate-800",
}: {
  blocks: QuestionContentBlocks
  statement: string
  statementClassName?: string
}) {
  return (
    <>
      <QuestionContentBlockList blocks={blocks.before} />
      <div className={statementClassName}>{statement}</div>
      <QuestionContentBlockList blocks={blocks.after} className="mt-3" />
    </>
  )
}
