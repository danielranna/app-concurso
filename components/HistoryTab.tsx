"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

type Error = {
  id: string
  created_at: string
  error_status?: string
  error_type?: string
  topics: {
    subjects: {
      id: string
      name: string
    }
  }
}

type ErrorStatus = {
  id: string
  name: string
  color?: string | null
}

type Props = {
  errors: Error[]
  errorStatuses: ErrorStatus[]
  onSubjectClick: (subjectId: string) => void
}

const COLORS = ['#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8']
const DEFAULT_STATUS_COLOR = "#64748b"

export default function HistoryTab({ errors, errorStatuses, onSubjectClick }: Props) {
  const router = useRouter()

  // Total + contagem por status (lista dinâmica com cores)
  const totalErrors = errors.length
  const statusCounts = useMemo(() => {
    return errorStatuses.map(status => {
      const count = errors.filter(e => {
        const errStatus = (e.error_status || "").toLowerCase().trim()
        const statusName = (status.name || "").toLowerCase().trim()
        return errStatus === statusName
      }).length
      return {
        ...status,
        count,
        color: status.color || DEFAULT_STATUS_COLOR
      }
    })
  }, [errors, errorStatuses])

  // RANKING GERAL DE MATÉRIAS (ACUMULADO)
  const subjectRanking = useMemo(() => {
    const subjectCounts: { [key: string]: { count: number; id: string } } = {}

    errors.forEach(error => {
      const subjectName = error.topics?.subjects?.name || "Sem matéria"
      const subjectId = error.topics?.subjects?.id || ""
      if (!subjectCounts[subjectName]) {
        subjectCounts[subjectName] = { count: 0, id: subjectId }
      }
      subjectCounts[subjectName].count++
    })

    return Object.entries(subjectCounts)
      .map(([materia, data]) => ({
        materia,
        quantidade: data.count,
        id: data.id
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 10) // Top 10
  }, [errors])

  // TIPOS DE ERRO MAIS FREQUENTES
  const errorTypes = useMemo(() => {
    const typeCounts: { [key: string]: number } = {}

    errors.forEach(error => {
      const type = error.error_type || "Não especificado"
      typeCounts[type] = (typeCounts[type] || 0) + 1
    })

    return Object.entries(typeCounts)
      .map(([tipo, quantidade], index) => ({
        tipo,
        quantidade,
        index
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 6)
  }, [errors])

  // STATUS DOS ERROS (para o gráfico de pizza)
  const chartStatusData = useMemo(() => {
    const counts: { [key: string]: number } = {}

    errors.forEach(error => {
      const status = error.error_status || "normal"
      counts[status] = (counts[status] || 0) + 1
    })

    return Object.entries(counts)
      .map(([status, quantidade]) => ({
        status,
        quantidade
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
  }, [errors])

  // ERROS REINCIDENTES NO LONGO PRAZO (matérias com mais erros com status "Reincidente")
  const reincidentSubjects = useMemo(() => {
    const subjectErrors: { [key: string]: number } = {}
    
    // Conta apenas erros com status "Reincidente"
    errors.forEach(error => {
      const status = (error.error_status || "").toLowerCase().trim()
      if (status === "reincidente") {
        const subjectName = error.topics?.subjects?.name || "Sem matéria"
        subjectErrors[subjectName] = (subjectErrors[subjectName] || 0) + 1
      }
    })

    return Object.entries(subjectErrors)
      .map(([materia, quantidade]) => ({
        materia,
        quantidade
      }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 8)
  }, [errors])

  return (
    <div className="space-y-6">
      {/* CARDS: Total + lista de status com cores */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          onClick={() => router.push("/resumo-periodo?type=total&all=true")}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left transition hover:shadow-md hover:ring-2 hover:ring-slate-300 cursor-pointer"
        >
          <p className="text-sm text-slate-600">Total de Erros</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{totalErrors}</p>
          <p className="mt-1 text-xs text-slate-500">Acumulado</p>
        </button>
        {statusCounts.map(({ id, name, count, color }) => {
          const pct = totalErrors > 0 ? Math.round((count / totalErrors) * 100) : 0
          return (
            <button
              key={id}
              type="button"
              onClick={() => router.push(`/resumo-periodo?status=${encodeURIComponent(name)}&all=true`)}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left transition hover:shadow-md hover:ring-2 cursor-pointer"
              style={{ borderLeftWidth: 4, borderLeftColor: color }}
            >
              <p className="text-sm text-slate-600">{name}</p>
              <p className="mt-1 text-2xl font-bold" style={{ color }}>{pct}%</p>
              <p className="mt-1 text-xs text-slate-500">
                {count} de {totalErrors} erros
              </p>
            </button>
          )
        })}
      </div>

      {/* RANKING GERAL DE MATÉRIAS */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">
          Ranking Geral de Matérias (Acumulado)
        </h3>
        <div style={{ width: "100%", height: Math.max(300, subjectRanking.length * 50) }}>
          {subjectRanking.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={subjectRanking} 
                layout="vertical"
                onClick={(data: any) => {
                  if (data?.activePayload?.[0]?.payload?.id) {
                    onSubjectClick(data.activePayload[0].payload.id)
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  type="number"
                  stroke="#64748b"
                  style={{ fontSize: "12px" }}
                  allowDecimals={false}
                />
                <YAxis 
                  type="category"
                  dataKey="materia"
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
                />
                <Bar 
                  dataKey="quantidade" 
                  fill="#0f172a"
                  radius={[0, 8, 8, 0]}
                  cursor="pointer"
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

      {/* GRID COM TIPOS DE ERRO E STATUS */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* TIPOS DE ERRO MAIS FREQUENTES */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-800">
            Tipos de Erro Mais Frequentes
          </h3>
          <div style={{ width: "100%", height: 450 }}>
            {errorTypes.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={errorTypes}
                    cx="50%"
                    cy="50%"
                    labelLine={(props: any) => {
                      const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props
                      const RADIAN = Math.PI / 180
                      
                      // Calcula o ponto de início da linha (na borda externa do gráfico)
                      const startX = cx + outerRadius * Math.cos(-midAngle * RADIAN)
                      const startY = cy + outerRadius * Math.sin(-midAngle * RADIAN)
                      
                      // Calcula o ponto final da linha (fora do gráfico)
                      const isSmall = percent < 0.08
                      const isVerySmall = percent < 0.03
                      const labelRadius = isVerySmall 
                        ? outerRadius + 50
                        : isSmall 
                        ? outerRadius + 40
                        : outerRadius + 30
                      
                      const endX = cx + labelRadius * Math.cos(-midAngle * RADIAN)
                      const endY = cy + labelRadius * Math.sin(-midAngle * RADIAN)
                      
                      return (
                        <line
                          x1={startX}
                          y1={startY}
                          x2={endX}
                          y2={endY}
                          stroke="#64748b"
                          strokeWidth={1.5}
                        />
                      )
                    }}
                    label={(props: any) => {
                      const { cx, cy, midAngle, outerRadius, percent, payload } = props
                      const RADIAN = Math.PI / 180
                      
                      // SEMPRE posiciona labels FORA do gráfico
                      // Ajusta a distância baseado no tamanho da fatia
                      const isSmall = percent < 0.08
                      const isVerySmall = percent < 0.03
                      
                      // Todos os labels ficam fora, mas com distâncias diferentes
                      const labelRadius = isVerySmall 
                        ? outerRadius + 50
                        : isSmall 
                        ? outerRadius + 40
                        : outerRadius + 30  // Fatias maiores também ficam fora
                      
                      const x = cx + labelRadius * Math.cos(-midAngle * RADIAN)
                      const y = cy + labelRadius * Math.sin(-midAngle * RADIAN)
                      
                      const tipo = payload?.tipo || ""
                      const percentValue = (percent * 100).toFixed(1)
                      
                      // Ajusta o tamanho da fonte baseado no tamanho da fatia
                      const fontSize = isVerySmall ? 11 : isSmall ? 12 : 13
                      
                      return (
                        <text 
                          x={x} 
                          y={y} 
                          fill="#0f172a" 
                          textAnchor={x > cx ? 'start' : 'end'} 
                          dominantBaseline="central"
                          fontSize={fontSize}
                          fontWeight={600}
                        >
                          {`${tipo} ${percentValue}%`}
                        </text>
                      )
                    }}
                    outerRadius={140}
                    innerRadius={30}
                    fill="#8884d8"
                    dataKey="quantidade"
                  >
                    {errorTypes.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      fontSize: "13px"
                    }}
                    formatter={(value: number | undefined, _name: string | undefined, props: any) => {
                      const v = value ?? 0
                      const total = errorTypes.reduce((sum, item) => sum + item.quantidade, 0)
                      const percent = total > 0 ? ((v / total) * 100).toFixed(1) : "0"
                      return [`${v} (${percent}%)`, props.payload.tipo]
                    }}
                    labelFormatter={() => ""}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500">
                Nenhum dado disponível
              </div>
            )}
          </div>
        </div>

        {/* STATUS DOS ERROS */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-800">
            Distribuição por Status
          </h3>
          <div style={{ width: "100%", height: 300 }}>
            {chartStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartStatusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="status" 
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

      {/* ERROS REINCIDENTES NO LONGO PRAZO */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">
          Matérias com Maior Reincidência (Histórico)
        </h3>
        <div style={{ width: "100%", height: Math.max(250, reincidentSubjects.length * 50) }}>
          {reincidentSubjects.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reincidentSubjects} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  type="number"
                  stroke="#64748b"
                  style={{ fontSize: "12px" }}
                  allowDecimals={false}
                />
                <YAxis 
                  type="category"
                  dataKey="materia"
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
                />
                <Bar 
                  dataKey="quantidade" 
                  fill="#dc2626"
                  radius={[0, 8, 8, 0]}
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
