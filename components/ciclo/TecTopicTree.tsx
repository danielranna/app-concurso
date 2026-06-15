"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ChevronDown,
  ChevronRight,
  Folder,
  GripVertical,
} from "lucide-react"
import type { TecSubjectNode, TecSubjectTreeResponse } from "@/lib/tec-subject-tree-types"
import { flattenFolderTopics, topicKey, type TecTopicRef } from "@/lib/study-cycle-topic-utils"

export const DRAG_TYPE = "application/x-tec-cycle-drag"

export type DragPayload =
  | { kind: "topic"; tec_subject: string; tec_topic: string }
  | { kind: "folder"; name: string; topics: TecTopicRef[] }

type Props = {
  trees: TecSubjectTreeResponse[]
  flatTopics: TecTopicRef[]
  assignedKeys: Set<string>
  loading?: boolean
}

export default function TecTopicTree({
  trees,
  flatTopics,
  assignedKeys,
  loading,
}: Props) {
  const hasTrees = trees.some((t) => t.nodes.length > 0 || t.ungrouped.length > 0)

  const availableFlat = useMemo(
    () => flatTopics.filter((t) => !assignedKeys.has(topicKey(t))),
    [flatTopics, assignedKeys]
  )

  if (loading) {
    return <p className="py-8 text-center text-sm text-slate-400">Carregando assuntos...</p>
  }

  if (!hasTrees) {
    if (availableFlat.length === 0) {
      return (
        <p className="text-sm text-slate-500">
          {flatTopics.length === 0 ? (
            <>
              Mapeie esta matéria ao banco TEC em{" "}
              <Link href="/questoes/mapeamento" className="text-teal-700 underline">
                Questões → Mapeamento
              </Link>
              .
            </>
          ) : (
            "Todos os assuntos já estão em blocos."
          )}
        </p>
      )
    }
    return (
      <ul className="space-y-1">
        {availableFlat.map((t) => (
          <TopicRow key={topicKey(t)} topic={t} />
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-3">
      {trees.map((tree) => (
        <div key={tree.tec_subject}>
          {trees.length > 1 && (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
              {tree.tec_subject}
            </p>
          )}
          <ul className="space-y-0.5">
            {tree.nodes.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                assignedKeys={assignedKeys}
              />
            ))}
          </ul>
          {tree.ungrouped.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-[10px] font-medium uppercase text-slate-400">
                Sem pasta
              </p>
              <ul className="space-y-0.5">
                {tree.ungrouped
                  .filter((n) => {
                    const topics = flattenFolderTopics(n)
                    return topics.some((t) => !assignedKeys.has(topicKey(t)))
                  })
                  .map((node) => (
                    <TreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      assignedKeys={assignedKeys}
                    />
                  ))}
              </ul>
            </div>
          )}
        </div>
      ))}
      <p className="text-[10px] text-slate-400">
        Arraste uma pasta para adicionar todos os assuntos dentro dela.
      </p>
    </div>
  )
}

function TreeNode({
  node,
  depth,
  assignedKeys,
}: {
  node: TecSubjectNode
  depth: number
  assignedKeys: Set<string>
}) {
  const [open, setOpen] = useState(depth < 2)
  const isFolder = node.node_type === "folder"

  if (isFolder) {
    const allTopics = flattenFolderTopics(node)
    const available = allTopics.filter((t) => !assignedKeys.has(topicKey(t)))
    if (available.length === 0) return null

    const payload: DragPayload = {
      kind: "folder",
      name: node.name,
      topics: available,
    }

    return (
      <div>
        <div
          className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-50"
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="shrink-0 text-slate-400"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          <div
            draggable
            title="Arraste para adicionar todos os assuntos desta pasta"
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
            }}
            className="flex flex-1 cursor-grab items-center gap-1.5 rounded border border-transparent px-1 py-0.5 text-sm active:cursor-grabbing hover:border-violet-200 hover:bg-violet-50/50"
          >
            <GripVertical className="h-3 w-3 shrink-0 text-slate-300" />
            <Folder className="h-3.5 w-3.5 shrink-0 text-violet-500" />
            <span className="truncate font-medium text-slate-800">{node.name}</span>
            <span className="ml-auto shrink-0 rounded bg-violet-100 px-1.5 text-[10px] text-violet-700">
              {available.length}
            </span>
          </div>
        </div>
        {open &&
          (node.children ?? []).map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              assignedKeys={assignedKeys}
            />
          ))}
      </div>
    )
  }

  const topic = (node.tec_topic ?? node.name ?? "").trim()
  if (!topic || assignedKeys.has(topicKey({ tec_subject: node.tec_subject, tec_topic: topic }))) {
    return null
  }

  return (
    <div style={{ paddingLeft: depth * 12 + 28 }}>
      <TopicRow topic={{ tec_subject: node.tec_subject, tec_topic: topic }} />
    </div>
  )
}

function TopicRow({ topic }: { topic: TecTopicRef }) {
  const payload: DragPayload = {
    kind: "topic",
    tec_subject: topic.tec_subject,
    tec_topic: topic.tec_topic,
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
      }}
      className="flex cursor-grab items-center gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-sm active:cursor-grabbing hover:bg-slate-100"
    >
      <GripVertical className="h-3 w-3 shrink-0 text-slate-400" />
      <span className="truncate">{topic.tec_topic || topic.tec_subject}</span>
    </div>
  )
}

export function parseDragPayload(raw: string): DragPayload | null {
  try {
    const data = JSON.parse(raw) as DragPayload
    if (data.kind === "topic" && data.tec_subject) return data
    if (data.kind === "folder" && Array.isArray(data.topics)) return data
    return null
  } catch {
    return null
  }
}

export function dragPayloadToTopics(payload: DragPayload): TecTopicRef[] {
  if (payload.kind === "folder") return payload.topics
  return [{ tec_subject: payload.tec_subject, tec_topic: payload.tec_topic }]
}
