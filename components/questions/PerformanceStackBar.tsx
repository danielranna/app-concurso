type Props = {
  correct: number
  wrong: number
  showText?: boolean
  className?: string
}

export default function PerformanceStackBar({
  correct,
  wrong,
  showText = true,
  className = "",
}: Props) {
  const total = correct + wrong
  const pctCorrect = total > 0 ? (correct / total) * 100 : 0
  const pctWrong = total > 0 ? (wrong / total) * 100 : 0

  return (
    <div className={`flex min-w-0 flex-1 items-center gap-3 ${className}`}>
      <div className="h-2 min-w-[80px] flex-1 overflow-hidden rounded-full bg-slate-100">
        {total > 0 ? (
          <div className="flex h-full">
            <div className="bg-green-500" style={{ width: `${pctCorrect}%` }} />
            <div className="bg-red-500" style={{ width: `${pctWrong}%` }} />
          </div>
        ) : null}
      </div>
      {showText && total > 0 && (
        <p className="shrink-0 text-xs text-slate-600 tabular-nums">
          <span className="text-green-700">{Math.round(pctCorrect)}%</span> ({correct}){" "}
          <span className="text-red-600">{Math.round(pctWrong)}%</span> ({wrong})
        </p>
      )}
    </div>
  )
}
