"use client"

import type { StudyCycle, StudyCycleBlock } from "@/lib/study-cycle-types"
import { WEEKDAY_LABELS } from "@/lib/study-cycle-planner"

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
}

export default function WeekGrid({ cycle }: Props) {
  const subjectColorMap = new Map<string, string>()
  cycle.subjects.forEach((s, i) => {
    subjectColorMap.set(s.subject_id, SUBJECT_COLORS[i % SUBJECT_COLORS.length])
  })

  const weightMap = new Map(
    cycle.subjects.map((s) => [s.subject_id, s.weight ?? s.times_in_cycle ?? 1])
  )

  const weeks = groupDaysIntoWeeks(cycle.days, cycle.weekday_limits)

  return (
    <div className="space-y-6">
      {weeks.map((week, wi) => (
        <section key={wi} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Semana {wi + 1}
          </h3>
          <div className="grid gap-2 sm:grid-cols-7">
            {[0, 1, 2, 3, 4, 5, 6].map((wd) => {
              const day = week.find((d) => d.weekday === wd)
              return (
                <div
                  key={wd}
                  className="min-h-[6rem] rounded-lg border border-slate-100 bg-slate-50/50 p-2"
                >
                  <p className="mb-1 text-[10px] font-medium uppercase text-slate-400">
                    {WEEKDAY_LABELS[wd]}
                  </p>
                  {day ? (
                    <div className="space-y-1">
                      {day.blocks.map((block, bi) => (
                        <BlockCard
                          key={bi}
                          block={block}
                          colorClass={
                            subjectColorMap.get(block.subject_id) ??
                            SUBJECT_COLORS[0]
                          }
                          weight={weightMap.get(block.subject_id) ?? 1}
                          subjectName={block.subject_name}
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
}: {
  block: StudyCycleBlock
  colorClass: string
  weight: number
  subjectName?: string
}) {
  const miniCycle = block.params.mini_cycle_index
  const pass = block.params.block_pass

  return (
    <div
      className={`rounded border px-1.5 py-1 text-[10px] leading-tight ${colorClass}`}
      title={block.label}
    >
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

function groupDaysIntoWeeks(
  days: StudyCycle["days"],
  weekdayLimits: StudyCycle["weekday_limits"]
) {
  const activeWeekdays = weekdayLimits
    .filter((w) => w.active)
    .map((w) => w.weekday)
    .sort((a, b) => a - b)

  const weeks: (StudyCycle["days"][0] & { blocks: StudyCycleBlock[] })[][] = []
  let currentWeek: StudyCycle["days"] = []

  for (const day of days) {
    const wd = day.weekday ?? activeWeekdays[0] ?? 1
    if (
      currentWeek.length > 0 &&
      wd <= (currentWeek[currentWeek.length - 1]?.weekday ?? 0)
    ) {
      weeks.push(currentWeek)
      currentWeek = []
    }
    currentWeek.push(day)
  }
  if (currentWeek.length) weeks.push(currentWeek)

  if (!weeks.length && days.length) {
    const perWeek = Math.max(1, activeWeekdays.length)
    for (let i = 0; i < days.length; i += perWeek) {
      weeks.push(days.slice(i, i + perWeek))
    }
  }

  return weeks
}
