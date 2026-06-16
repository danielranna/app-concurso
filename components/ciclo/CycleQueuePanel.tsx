"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ListOrdered,
  Loader2,
  SkipForward,
  Sparkles,
  Undo2,
} from "lucide-react"
import type { PaceAnalytics, QueueState } from "@/lib/study-cycle-queue"
import {
  resolveQueueContentBlock,
  resolveQueueNotebook,
} from "@/lib/study-cycle-queue-display"
import type { StudyCycle } from "@/lib/study-cycle-types"
import type { TecSubjectTreeResponse } from "@/lib/tec-subject-tree-types"
import BlockTopicGroups from "@/components/ciclo/BlockTopicGroups"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

type Props = {
  userId: string
  cycle: StudyCycle
  queue: QueueState
  loading?: boolean
  onQueueChange: (data: {
    queue: QueueState
    cycle: StudyCycle
    pace?: PaceAnalytics
  }) => void
}

export default function CycleQueuePanel({
  userId,
  cycle,
  queue,
  loading,
  onQueueChange,
}: Props) {
  const [acting, setActing] = useState(false)
  const [reopeningId, setReopeningId] = useState<string | null>(null)
  const [showPending, setShowPending] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [topicTrees, setTopicTrees] = useState<TecSubjectTreeResponse[]>([])

  const weightMap = new Map(
    cycle.subjects.map((s) => [s.subject_id, s.weight ?? s.times_in_cycle ?? 1])
  )

  const progressPct =
    queue.stats.total > 0
      ? Math.round((queue.stats.completed / queue.stats.total) * 100)
      : 0

  async function runAction(action: "complete" | "skip") {
    if (!queue.current?.id) return
    setActing(true)
    try {
      const res = await fetch("/api/ciclo/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action,
          block_id: queue.current.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? "Erro")
        return
      }
      if (data.queue && data.cycle) {
        onQueueChange({
          queue: data.queue,
          cycle: data.cycle,
          pace: data.pace ?? undefined,
        })
      }
    } finally {
      setActing(false)
    }
  }

  async function reopenCompleted(blockId: string) {
    setReopeningId(blockId)
    try {
      const res = await fetch("/api/ciclo/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "reopen",
          block_id: blockId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? "Erro")
        return
      }
      if (data.queue && data.cycle) {
        onQueueChange({
          queue: data.queue,
          cycle: data.cycle,
          pace: data.pace ?? undefined,
        })
      }
    } finally {
      setReopeningId(null)
    }
  }

  const nextPending = queue.pending.slice(1, 6)
  const recentCompleted = queue.completed.slice(0, 10)
  const currentContent = resolveQueueContentBlock(cycle, queue.current)
  const currentNotebook = resolveQueueNotebook(cycle, queue.current)

  useEffect(() => {
    const subjectId = currentContent?.subject_id ?? queue.current?.subject_id
    if (!userId || !subjectId) {
      setTopicTrees([])
      return
    }
    let cancelled = false
    fetch(
      `/api/ciclo/content-blocks?user_id=${userId}&subject_id=${subjectId}&tec_tree=1`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTopicTrees(d.trees ?? [])
      })
      .catch(() => {
        if (!cancelled) setTopicTrees([])
      })
    return () => {
      cancelled = true
    }
  }, [userId, currentContent?.subject_id, queue.current?.subject_id])

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <ListOrdered className="h-4 w-4" />
              </div>
              <CardTitle>Fila de estudo</CardTitle>
            </div>
            <CardDescription>
              Siga a ordem do calendário — você pode estudar mais ou menos blocos
              por dia.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">{queue.stats.completed} concluídas</Badge>
            <Badge variant="outline">{queue.stats.pending} restantes</Badge>
            <Badge variant="secondary">{queue.stats.total} total</Badge>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Progresso do ciclo</span>
            <span className="font-medium tabular-nums text-slate-700">
              {progressPct}%
            </span>
          </div>
          <Progress value={progressPct} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : queue.current ? (
          <div className="relative overflow-hidden rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-emerald-50/60 p-5 shadow-sm shadow-teal-100/50">
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-teal-200/20 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal-600" />
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
                  Agora
                </p>
              </div>
              <p className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
                {queue.current.subject_name ?? "Matéria"}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-700">
                {currentContent?.name ?? queue.current.content_block_name ?? queue.current.label}
              </p>
              {queue.current.label !== currentContent?.name && (
                <p className="mt-0.5 text-xs text-slate-500">{queue.current.label}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">
                  ×{weightMap.get(queue.current.subject_id) ?? 1}
                </Badge>
                {queue.current.params.block_pass != null && (
                  <Badge variant="outline">
                    {queue.current.params.block_pass}ª pass
                  </Badge>
                )}
                {queue.current.params.mini_cycle_index != null && (
                  <Badge variant="outline">
                    mc{queue.current.params.mini_cycle_index + 1}
                  </Badge>
                )}
              </div>

              {(currentContent?.study_note?.trim() ||
                (currentContent?.topics?.length ?? 0) > 0 ||
                currentNotebook) && (
                <div className="mt-4 space-y-3 rounded-xl border border-white/80 bg-white/70 p-3">
                  {currentContent?.study_note?.trim() && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Conteúdo
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {currentContent.study_note}
                      </p>
                    </div>
                  )}
                  {(currentContent?.topics?.length ?? 0) > 0 && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Assuntos do bloco
                      </p>
                      <BlockTopicGroups
                        topics={currentContent!.topics}
                        trees={topicTrees}
                        compact
                        defaultOpen={currentContent!.topics.length <= 12}
                      />
                    </div>
                  )}
                  {currentNotebook && (
                    <Link
                      href={`/questoes/cadernos/${currentNotebook.id}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 transition-colors hover:bg-teal-100"
                    >
                      <BookOpen className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">
                        Estudar: {currentNotebook.name}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    </Link>
                  )}
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={acting}
                  onClick={() => runAction("complete")}
                  size="lg"
                >
                  {acting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Concluir
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={acting || queue.pending.length < 2}
                  onClick={() => runAction("skip")}
                  size="lg"
                >
                  <SkipForward className="h-4 w-4" />
                  Trocar com o próximo
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-6 text-center">
            <Check className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-2 text-sm font-medium text-emerald-800">
              Todas as sessões foram concluídas.
            </p>
          </div>
        )}

        {nextPending.length > 0 && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            <button
              type="button"
              onClick={() => setShowPending(!showPending)}
              className="flex w-full items-center justify-between text-sm font-medium text-slate-700"
            >
              <span>
                Próximas ({queue.pending.length - (queue.current ? 1 : 0)})
              </span>
              {showPending ? (
                <ChevronUp className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </button>
            {showPending && (
              <ul className="mt-3 space-y-2">
                {nextPending.map((item, i) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-white bg-white px-3 py-2.5 text-sm shadow-sm"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
                      {i + 2}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">
                        {item.subject_name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {item.label}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {recentCompleted.length > 0 && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            <button
              type="button"
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex w-full items-center justify-between text-sm font-medium text-slate-700"
            >
              <span>Concluídas ({queue.stats.completed})</span>
              {showCompleted ? (
                <ChevronUp className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </button>
            {showCompleted && (
              <ul className="mt-3 space-y-1.5">
                {recentCompleted.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-500"
                    )}
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span className="min-w-0 flex-1 truncate line-through opacity-75">
                      {item.subject_name} — {item.label}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs"
                      disabled={!item.id || reopeningId === item.id}
                      onClick={() => item.id && reopenCompleted(item.id)}
                      title="Desfazer conclusão"
                    >
                      {reopeningId === item.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Undo2 className="h-3 w-3" />
                      )}
                      Desfazer
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
