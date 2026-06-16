"use client"

import { Check } from "lucide-react"
import type { StudyCycle, StudyCycleBlock } from "@/lib/study-cycle-types"
import { WEEKDAY_LABELS } from "@/lib/study-cycle-planner"
import { groupDaysIntoWeeks, getDayCellSummary } from "@/lib/study-cycle-week-utils"

const SUBJECT_COLORS = [
  "bg-teal-100 border-teal-200 text-teal-900",
  "bg-violet-100 border-violet-200 text-violet-900",
  "bg-amber-100 border-amber-200 text-amber-900",
  "bg-sky-100 border-sky-200 text-sky-900",
  "bg-rose-100 border-rose-200 text-rose-900",
  "bg-emerald-100 border-emerald-200 text-emerald-900",
]

type Props = {
  cycle: StudyCycle
  completedBlockIds?: Set<string>
  currentBlockId?: string | null
}

export default function WeekGrid({
  cycle,
  completedBlockIds,
  currentBlockId,
}: Props) {
  const subjectColorMap = new Map<string, string>()
  cycle.subjects.forEach((s, i) => {
    subjectColorMap.set(s.subject_id, SUBJECT_COLORS[i % SUBJECT_COLORS.length])
  })

  const weightMap = new Map(
    cycle.subjects.map((s) => [s.subject_id, s.weight ?? s.times_in_cycle ?? 1])
  )

  const weeks = groupDaysIntoWeeks(cycle.days, cycle.weekday_limits)
  const subjectsPerDayLimit = cycle.subjects_per_day

  return (
    <div className="space-y-6">
      {subjectsPerDayLimit != null && subjectsPerDayLimit > 0 && (
        <p className="text-xs text-slate-500">
          Máximo configurado: {subjectsPerDayLimit} matérias distintas por dia de
          estudo
        </p>
      )}
      {weeks.map((week, wi) => (
        <section key={wi} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Semana {wi + 1}
          </h3>
          <div className="grid gap-2 sm:grid-cols-7">
            {[0, 1, 2, 3, 4, 5, 6].map((wd) => {
              const day = week.find((d) => d.weekday === wd)
              const summary = day ? getDayCellSummary(day) : null
              return (
                <div
                  key={wd}
                  className="min-h-[6rem] rounded-lg border border-slate-100 bg-slate-50/50 p-2"
                >
                  <p className="mb-1 text-[10px] font-medium uppercase text-slate-400">
                    {WEEKDAY_LABELS[wd]}
                  </p>
                  {day && summary ? (
                    <div className="space-y-1">
                      <div className="mb-1 space-y-0.5">
                        <p className="text-[9px] font-semibold text-slate-600">
                          {summary.dayLabel}
                        </p>
                        <p className="text-[8px] text-slate-400">
                          {summary.countLabel}
                        </p>
                      </div>
                      {day.blocks.map((block, bi) => (
                        <BlockCard
                          key={block.id ?? bi}
                          block={block}
                          colorClass={
                            subjectColorMap.get(block.subject_id) ??
                            SUBJECT_COLORS[0]
                          }
                          weight={weightMap.get(block.subject_id) ?? 1}
                          subjectName={block.subject_name}
                          isCompleted={
                            block.id != null && completedBlockIds?.has(block.id)
                          }
                          isCurrent={block.id != null && block.id === currentBlockId}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-300">—</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function BlockCard({
  block,
  colorClass,
  weight,
  subjectName,
  isCompleted,
  isCurrent,
}: {
  block: StudyCycleBlock
  colorClass: string
  weight: number
  subjectName?: string
  isCompleted?: boolean
  isCurrent?: boolean
}) {
  const miniCycle = block.params.mini_cycle_index
  const pass = block.params.block_pass

  return (
    <div
      className={`relative rounded border px-1.5 py-1 text-[10px] leading-tight ${colorClass} ${
        isCompleted ? "opacity-50 line-through" : ""
      } ${isCurrent ? "ring-2 ring-teal-500 ring-offset-1" : ""} ${
        isCompleted ? "border-emerald-400" : ""
      }`}
      title={block.label}
    >
      {isCompleted && (
        <Check className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-emerald-700" />
      )}
      <p className="truncate font-medium">{subjectName ?? block.label}</p>
      <p className="truncate opacity-80">{block.label}</p>
      <div className="mt-0.5 flex flex-wrap gap-0.5">
        <span className="rounded bg-white/60 px-1">×{weight}</span>
        {pass != null && (
          <span className="rounded bg-white/60 px-1">{pass}ª pass</span>
        )}
        {miniCycle != null && (
          <span className="rounded bg-white/60 px-1">mc{miniCycle + 1}</span>
        )}
      </div>
    </div>
  )
}
