"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"
import CycleQueuePanel from "@/components/ciclo/CycleQueuePanel"
import type { QueueState } from "@/lib/study-cycle-queue"
import type { StudyCycle } from "@/lib/study-cycle-types"

type Props = {
  userId: string
}

export default function HomeCycleQueueWidget({ userId }: Props) {
  const [cycle, setCycle] = useState<StudyCycle | null>(null)
  const [queue, setQueue] = useState<QueueState | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ciclo/queue?user_id=${userId}`)
      const data = await res.json()
      if (!data.queue || !data.cycle?.cycle_blocks?.length) {
        setCycle(null)
        setQueue(null)
        return
      }
      setCycle(data.cycle)
      setQueue(data.queue)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-200/80 bg-white py-10 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
      </div>
    )
  }

  if (!cycle || !queue) {
    return null
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <Link
          href="/ciclo"
          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
        >
          Ver ritmo e detalhes
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <CycleQueuePanel
        userId={userId}
        cycle={cycle}
        queue={queue}
        onQueueChange={({ queue: q, cycle: c }) => {
          setQueue(q)
          setCycle(c)
        }}
      />
    </div>
  )
}
