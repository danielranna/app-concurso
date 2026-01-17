"use client"

import { useState, useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

type Error = {
  id: string
  created_at: string
  topics: {
    id: string
    name: string
  }
}

type Props = {
  errors: Error[]
  subjectId: string
}

type ChartData = {
  tema: string
  quantidade: number
}

export default function ErrorsByTopicChart({ errors, subjectId }: Props) {
  const [period, setPeriod] = useState<"week" | "month">("week")

  const chartData = useMemo<ChartData[]>(() => {
    if (errors.length === 0) return []

    const now = new Date()
    const periodMs = period === "week" 
      ? 7 * 24 * 60 * 60 * 1000 
      : 30 * 24 * 60 * 60 * 1000
    
    const cutoffDate = new Date(now.getTime() - periodMs)

    // Filtra erros do período selecionado
    const filteredErrors = errors.filter(error => {
      const errorDate = new Date(error.created_at)
      return errorDate >= cutoffDate
    })

    // Agrupa por tema
    const topicCounts: { [key: string]: number } = {}

    filteredErrors.forEach(error => {
      const topicName = error.topics?.name || "Sem tema"
      topicCounts[topicName] = (topicCounts[topicName] || 0) + 1
    })

    // Converte para array e ordena por quantidade (decrescente)
    return Object.entries(topicCounts)
      .map(([tema, quantidade]) => ({
        tema,
        quantidade
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
  }, [errors, period])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">
          Erros por Tema
        </h3>
        <div className="flex gap-2 rounded-lg border border-slate-200 p-1">
          <button
            onClick={() => setPeriod("week")}
            className={`rounded px-3 py-1 text-sm font-medium transition ${
              period === "week"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Semana
          </button>
          <button
            onClick={() => setPeriod("month")}
            className={`rounded px-3 py-1 text-sm font-medium transition ${
              period === "month"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Mês
          </button>
        </div>
      </div>

      <div style={{ width: "100%", height: 300 }}>
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-500">
            Nenhum dado disponível
          </div>
        ) : (
          <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                type="number"
                stroke="#64748b"
                style={{ fontSize: "12px" }}
              />
              <YAxis 
                type="category"
                dataKey="tema"
                stroke="#64748b"
                style={{ fontSize: "12px" }}
                width={120}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "8px 12px"
                }}
                labelStyle={{ fontWeight: 600, marginBottom: "4px" }}
              />
              <Bar 
                dataKey="quantidade" 
                fill="#6366f1"
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
