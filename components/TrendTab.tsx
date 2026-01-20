"use client"

import { useState, useMemo } from "react"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"

type Error = {
  id: string
  created_at: string
  topics: {
    subjects: {
      id: string
      name: string
    }
  }
}

type Props = {
  errors: Error[]
}

export default function TrendTab({ errors }: Props) {
  const [period, setPeriod] = useState<"week" | "month">("week")

  // Calcula início da semana (Segunda-feira)
  const getWeekStart = (date: Date): Date => {
    const dayOfWeek = date.getDay()
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - diff)
    weekStart.setHours(0, 0, 0, 0)
    return weekStart
  }

  // EVOLUÇÃO POR SEMANA
  const weeklyTrend = useMemo(() => {
    const now = new Date()
    const weeks: { [key: string]: number } = {}
    
    // Últimas 8 semanas
    for (let i = 7; i >= 0; i--) {
      const weekDate = new Date(now)
      weekDate.setDate(now.getDate() - i * 7)
      const weekStart = getWeekStart(weekDate)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)

      const weekKey = weekStart.toLocaleDateString("pt-BR", { 
        day: "2-digit", 
        month: "short" 
      })
      weeks[weekKey] = 0
    }

    // Conta erros por semana
    errors.forEach(error => {
      const errorDate = new Date(error.created_at)
      const weekStart = getWeekStart(errorDate)
      const weekKey = weekStart.toLocaleDateString("pt-BR", { 
        day: "2-digit", 
        month: "short" 
      })
      
      if (weeks.hasOwnProperty(weekKey)) {
        weeks[weekKey]++
      }
    })

    return Object.entries(weeks).map(([period, quantidade]) => ({
      period,
      quantidade
    }))
  }, [errors])

  // EVOLUÇÃO POR MÊS
  const monthlyTrend = useMemo(() => {
    const now = new Date()
    const months: { [key: string]: number } = {}
    
    // Últimos 6 meses
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthKey = monthDate.toLocaleDateString("pt-BR", { 
        month: "short", 
        year: "2-digit" 
      })
      months[monthKey] = 0
    }

    // Conta erros por mês
    errors.forEach(error => {
      const errorDate = new Date(error.created_at)
      const monthKey = errorDate.toLocaleDateString("pt-BR", { 
        month: "short", 
        year: "2-digit" 
      })
      
      if (months.hasOwnProperty(monthKey)) {
        months[monthKey]++
      }
    })

    return Object.entries(months).map(([period, quantidade]) => ({
      period,
      quantidade
    }))
  }, [errors])

  const chartData = period === "week" ? weeklyTrend : monthlyTrend

  return (
    <div className="space-y-6">
      {/* FILTRO PERÍODO */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            Evolução de Erros ao Longo do Tempo
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
              Por Semana
            </button>
            <button
              onClick={() => setPeriod("month")}
              className={`rounded px-3 py-1 text-sm font-medium transition ${
                period === "month"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Por Mês
            </button>
          </div>
        </div>

        <div style={{ width: "100%", height: 400 }}>
          {chartData.some(d => d.quantidade > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="period" 
                  stroke="#64748b"
                  style={{ fontSize: "12px" }}
                />
                <YAxis 
                  stroke="#64748b"
                  style={{ fontSize: "12px" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "8px 12px"
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="quantidade"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={{ fill: "#0f172a", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-slate-500">
              Nenhum dado disponível
            </div>
          )}
        </div>
      </div>

      {/* COMPARAÇÃO ENTRE PERÍODOS */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">
          Comparação {period === "week" ? "Semanal" : "Mensal"}
        </h3>
        <div style={{ width: "100%", height: 300 }}>
          {chartData.some(d => d.quantidade > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="period" 
                  stroke="#64748b"
                  style={{ fontSize: "12px" }}
                />
                <YAxis 
                  stroke="#64748b"
                  style={{ fontSize: "12px" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "8px 12px"
                  }}
                />
                <Bar 
                  dataKey="quantidade" 
                  fill="#0f172a"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-slate-500">
              Nenhum dado disponível
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
