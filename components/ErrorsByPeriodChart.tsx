"use client"

import { useState, useMemo } from "react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

type Error = {
  id: string
  created_at: string
}

type Props = {
  errors: Error[]
}

type ChartData = {
  period: string
  quantidade: number
}

export default function ErrorsByPeriodChart({ errors }: Props) {
  const [period, setPeriod] = useState<"week" | "month">("week")

  const chartData = useMemo<ChartData[]>(() => {
    if (errors.length === 0) return []

    const now = new Date()
    const periods: { [key: string]: number } = {}

    // Determina o número de períodos a mostrar e a função de agrupamento
    const periodCount = period === "week" ? 8 : 6 // 8 semanas ou 6 meses
    const periodMs = period === "week" 
      ? 7 * 24 * 60 * 60 * 1000 
      : 30 * 24 * 60 * 60 * 1000
    const cutoffDate = new Date(now.getTime() - periodCount * periodMs)

    // Inicializa os períodos com 0
    for (let i = periodCount - 1; i >= 0; i--) {
      const periodDate = new Date(now.getTime() - i * periodMs)
      let key: string
      
      if (period === "week") {
        // Para semanas: mostra a data de início da semana (Segunda-feira)
        const dayOfWeek = periodDate.getDay()
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Segunda = 0
        const weekStart = new Date(periodDate)
        weekStart.setDate(periodDate.getDate() - diff)
        weekStart.setHours(0, 0, 0, 0)
        
        key = weekStart.toLocaleDateString("pt-BR", { 
          day: "2-digit", 
          month: "short" 
        })
      } else {
        // Para meses: mostra o mês
        key = periodDate.toLocaleDateString("pt-BR", { 
          month: "short", 
          year: "2-digit" 
        })
      }
      
      periods[key] = 0
    }

    // Filtra erros do período selecionado e agrupa por período

    errors.forEach(error => {
      const errorDate = new Date(error.created_at)
      
      // Filtra apenas erros dentro do período selecionado
      if (errorDate < cutoffDate) return
      
      let periodKey: string
      
      if (period === "week") {
        const dayOfWeek = errorDate.getDay()
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
        const weekStart = new Date(errorDate)
        weekStart.setDate(errorDate.getDate() - diff)
        weekStart.setHours(0, 0, 0, 0)
        
        periodKey = weekStart.toLocaleDateString("pt-BR", { 
          day: "2-digit", 
          month: "short" 
        })
      } else {
        periodKey = errorDate.toLocaleDateString("pt-BR", { 
          month: "short", 
          year: "2-digit" 
        })
      }

      if (periods.hasOwnProperty(periodKey)) {
        periods[periodKey]++
      }
    })

    return Object.entries(periods).map(([period, quantidade]) => ({
      period,
      quantidade
    }))
  }, [errors, period])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">
          Erros por Período
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
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorQuantidade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0f172a" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#0f172a" stopOpacity={0.1} />
                </linearGradient>
              </defs>
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
                labelStyle={{ fontWeight: 600, marginBottom: "4px" }}
              />
              <Area
                type="monotone"
                dataKey="quantidade"
                stroke="#0f172a"
                strokeWidth={2}
                fill="url(#colorQuantidade)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
