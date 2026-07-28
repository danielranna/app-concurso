import { cn } from "@/lib/utils"
import {
  SEQUENCE_PATTERN_LABELS,
  type SequencePattern,
} from "@/lib/question-sequence-pattern"

const STYLE: Record<SequencePattern, string> = {
  confusao: "bg-amber-100 text-amber-900",
  aprendizado: "bg-teal-100 text-teal-900",
  esquecimento: "bg-rose-100 text-rose-900",
}

export function SequencePatternBadge({
  pattern,
  className,
}: {
  pattern: SequencePattern | null | undefined
  className?: string
}) {
  if (!pattern) return null
  return (
    <span
      className={cn(
        "inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
        STYLE[pattern],
        className
      )}
    >
      {SEQUENCE_PATTERN_LABELS[pattern]}
    </span>
  )
}
