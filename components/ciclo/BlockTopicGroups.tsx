"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Folder, X } from "lucide-react"
import type { StudyCycleContentBlockTopic } from "@/lib/study-cycle-types"
import type { TecSubjectTreeResponse } from "@/lib/tec-subject-tree-types"
import {
  buildAssignedTopicTree,
  groupTopicsBySubject,
  type AssignedTopicTreeNode,
} from "@/lib/study-cycle-topic-utils"
import { cn } from "@/lib/utils"

type Props = {
  topics: StudyCycleContentBlockTopic[]
  trees?: TecSubjectTreeResponse[]
  onRemoveTopic?: (topicId: string) => void
  compact?: boolean
  defaultOpen?: boolean
  className?: string
}

export default function BlockTopicGroups({
  topics,
  trees,
  onRemoveTopic,
  compact = false,
  defaultOpen = true,
  className,
}: Props) {
  const nodes = useMemo(() => {
    if (trees?.length) {
      const treeNodes = buildAssignedTopicTree(topics, trees)
      if (treeNodes.length) return treeNodes
    }
    return groupTopicsBySubject(topics).map((group) => ({
      kind: "folder" as const,
      name: group.tec_subject,
      count: group.topics.length,
      children: group.topics.map((topic) => ({
        kind: "topic" as const,
        topic,
        name: topic.tec_topic || topic.tec_subject,
      })),
    }))
  }, [topics, trees])

  if (!nodes.length) return null

  return (
    <div className={cn("space-y-1", className)}>
      {nodes.map((node, i) => (
        <TreeNode
          key={
            node.kind === "folder"
              ? `folder:${node.name}:${i}`
              : `topic:${node.topic.id ?? node.name}`
          }
          node={node}
          depth={0}
          onRemoveTopic={onRemoveTopic}
          compact={compact}
          defaultOpen={defaultOpen}
        />
      ))}
    </div>
  )
}

function TreeNode({
  node,
  depth,
  onRemoveTopic,
  compact,
  defaultOpen,
}: {
  node: AssignedTopicTreeNode
  depth: number
  onRemoveTopic?: (topicId: string) => void
  compact?: boolean
  defaultOpen?: boolean
}) {
  if (node.kind === "topic") {
    return (
      <div style={{ paddingLeft: depth * 12 + (depth > 0 ? 8 : 0) }}>
        <TopicRow
          label={node.name}
          topicId={node.topic.id}
          onRemove={onRemoveTopic}
          compact={compact}
        />
      </div>
    )
  }

  return (
    <FolderGroup
      name={node.name}
      count={node.count}
      depth={depth}
      compact={compact}
      defaultOpen={defaultOpen}
    >
      {node.children.map((child, i) => (
        <TreeNode
          key={
            child.kind === "folder"
              ? `folder:${child.name}:${i}`
              : `topic:${child.topic.id ?? child.name}`
          }
          node={child}
          depth={depth + 1}
          onRemoveTopic={onRemoveTopic}
          compact={compact}
          defaultOpen={defaultOpen}
        />
      ))}
    </FolderGroup>
  )
}

function FolderGroup({
  name,
  count,
  depth,
  children,
  compact,
  defaultOpen,
}: {
  name: string
  count: number
  depth: number
  children: React.ReactNode
  compact?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(
    defaultOpen ?? (depth < 2 || count <= 6)
  )

  return (
    <div
      className={cn(
        depth === 0 && "rounded-lg border border-slate-100 bg-slate-50/50"
      )}
      style={depth > 0 ? { paddingLeft: depth * 12 } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-1.5 text-left hover:bg-slate-50",
          depth === 0 ? "rounded-lg px-2 py-1.5" : "rounded-md px-1 py-1"
        )}
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
          {name}
        </span>
        <span className="shrink-0 rounded bg-violet-100 px-1.5 text-[10px] font-medium text-violet-700">
          {count}
        </span>
      </button>
      {open && (
        <div
          className={cn(
            "space-y-0.5",
            depth === 0
              ? "border-t border-slate-100 px-2 py-1.5"
              : "pb-0.5 pl-1"
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function TopicRow({
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
        "flex items-center gap-2 rounded-md border border-white bg-white px-2 py-1 text-slate-700 shadow-sm",
        compact ? "text-xs" : "text-sm"
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
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
