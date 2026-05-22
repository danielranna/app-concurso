import { reportSourceFromModel } from "@/lib/ai/report-source"

export default function ReportSourceBadge({
  modelUsed,
}: {
  modelUsed: string | null | undefined
}) {
  const { label, variant } = reportSourceFromModel(modelUsed)
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
        variant === "llm"
          ? "bg-violet-100 text-violet-800"
          : "bg-slate-100 text-slate-700"
      }`}
    >
      {label}
    </span>
  )
}
