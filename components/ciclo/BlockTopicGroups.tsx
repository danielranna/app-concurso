"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Folder, X } from "lucide-react"
import type { StudyCycleContentBlockTopic } from "@/lib/study-cycle-types"
import { groupTopicsBySubject } from "@/lib/study-cycle-topic-utils"
import { cn } from "@/lib/utils"

type Props = {
  topics: StudyCycleContentBlockTopic[]
  onRemoveTopic?: (topicId: string) => void
  compact?: boolean
  defaultOpen?: boolean
  className?: string
}

export default function BlockTopicGroups({
  topics,
  onRemoveTopic,
  compact = false,
  defaultOpen = true,
  className,
}: Props) {
  const groups = groupTopicsBySubject(topics)

  if (!groups.length) return null

  return (
    <div className={cn("space-y-1", className)}>
      {groups.map((group) => (
        <SubjectGroup
          key={group.tec_subject}
          tec_subject={group.tec_subject}
          topics={group.topics}
          onRemoveTopic={onRemoveTopic}
          compact={compact}
          defaultOpen={defaultOpen}
        />
      ))}
    </div>
  )
}

function SubjectGroup({
  tec_subject,
  topics,
  onRemoveTopic,
  compact,
  defaultOpen,
}: {
  tec_subject: string
  topics: StudyCycleContentBlockTopic[]
  onRemoveTopic?: (topicId: string) => void
  compact?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? true)
  const showFolderHeader = topics.length > 1 || tec_subject !== topics[0]?.tec_topic

  if (!showFolderHeader && topics.length === 1) {
    const t = topics[0]
    const label = t.tec_topic || t.tec_subject
    return (
      <TopicChip
        label={label}
        topicId={t.id}
        onRemove={onRemoveTopic}
        compact={compact}
      />
    )
  }

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
        <Folder className="h-3.5 w-3.5 shrink-0 text-violet-500" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-medium text-slate-800",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {tec_subject}
        </span>
        <span className="shrink-0 rounded bg-violet-100 px-1.5 text-[10px] font-medium text-violet-700">
          {topics.length}
        </span>
      </button>
      {open && (
        <ul className="space-y-0.5 border-t border-slate-100 px-2 py-1.5">
          {topics.map((t) => (
            <li
              key={t.id ?? `${t.tec_subject}:${t.tec_topic}`}
              className={cn(
                "flex items-center gap-2 rounded-md border border-white bg-white px-2 py-1 text-slate-700 shadow-sm",
                compact ? "text-xs" : "text-sm"
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {t.tec_topic || t.tec_subject}
              </span>
              {t.id && onRemoveTopic && (
                <button
                  type="button"
                  onClick={() => onRemoveTopic(t.id!)}
                  className="shrink-0 text-slate-400 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TopicChip({
  label,
  topicId,
  onRemove,
  compact,
}: {
  label: string
  topicId?: string
  onRemove?: (id: string) => void
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700",
        compact ? "text-xs" : "text-sm"
      )}
    >
      <span className="truncate">{label}</span>
      {topicId && onRemove && (
        <button
          type="button"
          onClick={() => onRemove(topicId)}
          className="shrink-0 text-slate-400 hover:text-red-500"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
