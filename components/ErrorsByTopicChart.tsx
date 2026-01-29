"use client"

import { useState, useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Calendar } from "lucide-react"

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
  const [period, setPeriod] = useState<"accumulated" | "week" | "month" | "custom">("accumulated")
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const chartData = useMemo<ChartData[]>(() => {
    if (errors.length === 0) return []

    let cutoffDate: Date
    let filterEndDate: Date
    const now = new Date()

    let filteredErrors: Error[]
    
    if (period === "accumulated") {
      // Acumulado: mostra todos os erros sem filtro de data
      filteredErrors = errors
    } else if (period === "custom" && startDate && endDate) {
      cutoffDate = new Date(startDate)
      filterEndDate = new Date(endDate)
      filteredErrors = errors.filter(error => {
        const errorDate = new Date(error.created_at)
        return errorDate >= cutoffDate && errorDate <= filterEndDate
      })
    } else if (period === "week") {
      // Calcula o início da semana atual (segunda-feira)
      const dayOfWeek = now.getDay()
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Segunda = 0
      cutoffDate = new Date(now)
      cutoffDate.setDate(now.getDate() - diff)
      cutoffDate.setHours(0, 0, 0, 0)
      
      // Fim da semana (domingo)
      filterEndDate = new Date(cutoffDate)
      filterEndDate.setDate(cutoffDate.getDate() + 6)
      filterEndDate.setHours(23, 59, 59, 999)
      
      filteredErrors = errors.filter(error => {
        const errorDate = new Date(error.created_at)
        return errorDate >= cutoffDate && errorDate <= filterEndDate
      })
    } else {
      // Mês: últimos 30 dias
      const periodMs = 30 * 24 * 60 * 60 * 1000
      cutoffDate = new Date(now.getTime() - periodMs)
      filterEndDate = now
      filteredErrors = errors.filter(error => {
        const errorDate = new Date(error.created_at)
        return errorDate >= cutoffDate && errorDate <= filterEndDate
      })
    }

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
  }, [errors, period, startDate, endDate])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">
          Erros por Tema
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex gap-2 rounded-lg border border-slate-200 p-1">
            <button
              onClick={() => {
                setPeriod("accumulated")
                setShowCustomPicker(false)
              }}
              className={`rounded px-3 py-1 text-sm font-medium transition ${
                period === "accumulated"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Acumulado
            </button>
            <button
              onClick={() => {
                setPeriod("week")
                setShowCustomPicker(false)
              }}
              className={`rounded px-3 py-1 text-sm font-medium transition ${
                period === "week"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => {
                setPeriod("month")
                setShowCustomPicker(false)
              }}
              className={`rounded px-3 py-1 text-sm font-medium transition ${
                period === "month"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Mês
            </button>
          </div>
          <div className="relative">
            <button
              onClick={() => {
                setShowCustomPicker(!showCustomPicker)
                if (!showCustomPicker) {
                  setPeriod("custom")
                }
              }}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1 text-sm font-medium transition ${
                period === "custom"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Calendar className="h-4 w-4" />
              Período
            </button>
            {showCustomPicker && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowCustomPicker(false)}
                />
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Data Início
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="w-full rounded border border-slate-300 p-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Data Fim
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="w-full rounded border border-slate-300 p-2 text-sm"
                      />
                    </div>
                    <button
                      onClick={() => setShowCustomPicker(false)}
                      className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ width: "100%", height: 300, minHeight: 300 }}>
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-500">
            Nenhum dado disponível
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                type="number"
                stroke="#64748b"
                style={{ fontSize: "12px" }}
                allowDecimals={false}
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
                fill="#0f172a"
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
