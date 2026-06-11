import { formatElapsed } from "@/lib/format-elapsed"
import type { StudySessionNotebookBreakdown } from "@/lib/question-types"

type Props = {
  breakdown: StudySessionNotebookBreakdown[]
}

export default function CombinedSessionNotebookSummary({ breakdown }: Props) {
  if (breakdown.length === 0) return null

  return (
    <div className="mt-6 text-left">
      <h3 className="mb-3 text-sm font-semibold text-green-900">
        Estatísticas por caderno
      </h3>
      <div className="overflow-x-auto rounded-lg border border-green-200 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-green-100 bg-green-50/80 text-left text-xs font-medium uppercase tracking-wide text-green-800">
              <th className="px-4 py-2.5">Caderno</th>
              <th className="px-4 py-2.5 text-right">Questões</th>
              <th className="px-4 py-2.5 text-right">Acertos</th>
              <th className="px-4 py-2.5 text-right">Desempenho</th>
              <th className="px-4 py-2.5 text-right">Tempo</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((row) => (
              <tr
                key={row.notebook_id}
                className="border-b border-green-50 last:border-b-0"
              >
                <td className="px-4 py-2.5 font-medium text-slate-800">
                  {row.name}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                  {row.total}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                  {row.correct}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                  {row.total > 0 ? `${row.pct}%` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">
                  {formatElapsed(row.time_ms)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
