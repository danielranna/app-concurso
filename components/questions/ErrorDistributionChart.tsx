"use client"

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
} from "recharts"
import type { AnalysisQuestionRow } from "@/lib/question-statistics-analysis"

const SUBJECT_COLORS = [
  "#0d9488",
  "#2563eb",
  "#dc2626",
  "#ca8a04",
  "#7c3aed",
  "#db2777",
  "#059669",
  "#ea580c",
]

function colorForSubject(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length]!
}

type Props = {
  questions: AnalysisQuestionRow[]
  onSelect: (q: AnalysisQuestionRow) => void
  selectedId?: string | null
}

export default function ErrorDistributionChart({
  questions,
  onSelect,
  selectedId,
}: Props) {
  const histMap = new Map<number, number>()
  for (const q of questions) {
    histMap.set(q.wrong_count, (histMap.get(q.wrong_count) ?? 0) + 1)
  }
  const histData = [...histMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([errors, count]) => ({ errors, count }))

  // Jitter Y so points with same wrong_count don't stack
  const byWrong = new Map<number, AnalysisQuestionRow[]>()
  for (const q of questions) {
    const list = byWrong.get(q.wrong_count) ?? []
    list.push(q)
    byWrong.set(q.wrong_count, list)
  }

  const scatterData = questions.map((q) => {
    const siblings = byWrong.get(q.wrong_count) ?? [q]
    const idx = siblings.findIndex((s) => s.question_id === q.question_id)
    const jitter =
      siblings.length <= 1 ? 0 : (idx / (siblings.length - 1)) * 0.8 - 0.4
    return {
      ...q,
      x: q.wrong_count,
      y: 1 + jitter,
      z: Math.min(q.attempt_count, 20),
      color: colorForSubject(q.subject_name),
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">
          Frequência de erros
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Quantas questões você errou 1×, 2×, 3×…
        </p>
        {histData.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Nenhum erro no período filtrado.
          </p>
        ) : (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="errors"
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "Erros por questão",
                    position: "insideBottom",
                    offset: -2,
                    style: { fontSize: 11, fill: "#64748b" },
                  }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  width={32}
                  label={{
                    value: "Qtd",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "#64748b" },
                  }}
                />
                <Tooltip
                  formatter={(v) => [v ?? 0, "Questões"]}
                  labelFormatter={(l) => `${l} erro(s)`}
                />
                <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800">
          Dispersão por questão
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Cada ponto é uma questão. Eixo X = vezes errada. Clique para ver
          detalhes. Cor = matéria; tamanho ≈ tentativas.
        </p>
        {scatterData.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Nenhuma questão errada para plotar.
          </p>
        ) : (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 16, bottom: 28, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Erros"
                  allowDecimals={false}
                  domain={[0, "dataMax + 1"]}
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "Número de erros",
                    position: "bottom",
                    offset: 8,
                    style: { fontSize: 11, fill: "#64748b" },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={[0.3, 1.7]}
                  hide
                />
                <ZAxis type="number" dataKey="z" range={[40, 200]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0]?.payload as AnalysisQuestionRow & {
                      color: string
                    }
                    return (
                      <div className="max-w-xs rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                        <p className="mb-1 line-clamp-3 text-sm font-medium text-slate-800">
                          {p.statement_preview || "Sem enunciado"}
                        </p>
                        <div className="space-y-0.5 text-xs text-slate-600">
                          <p>
                            <span className="font-medium">Matéria:</span>{" "}
                            {p.subject_name}
                          </p>
                          <p>
                            <span className="font-medium">Assunto:</span>{" "}
                            {p.tec_topic}
                          </p>
                          <p>
                            <span className="font-medium">Erros:</span>{" "}
                            {p.wrong_count} / {p.attempt_count} tentativas (
                            {p.correct_pct}% acerto)
                          </p>
                        </div>
                        <p className="mt-2 text-xs italic text-slate-400">
                          Clique para abrir
                        </p>
                      </div>
                    )
                  }}
                />
                <Scatter
                  data={scatterData}
                  onClick={(data) => {
                    if (data?.question_id) onSelect(data as AnalysisQuestionRow)
                  }}
                >
                  {scatterData.map((entry) => (
                    <Cell
                      key={entry.question_id}
                      fill={entry.color}
                      stroke={
                        selectedId === entry.question_id ? "#0f172a" : "transparent"
                      }
                      strokeWidth={selectedId === entry.question_id ? 2 : 0}
                      cursor="pointer"
                      opacity={
                        selectedId && selectedId !== entry.question_id ? 0.45 : 0.9
                      }
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
