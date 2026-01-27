"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts"

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

type Props = {
  errors: Error[]
  onSubjectClick: (subjectId: string) => void
}

const COLORS = ['#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8']

export default function HistoryTab({ errors, onSubjectClick }: Props) {
  const router = useRouter()

  // CARDS DE RESUMO ACUMULADOS
  const summaryCards = useMemo(() => {
    const total = errors.length
    // Filtra erros críticos (case-insensitive)
    const critical = errors.filter(e => {
      const status = (e.error_status || "").toLowerCase().trim()
      return status === "critico" || status === "crítico" || status.includes("critic")
    }).length
    // Filtra erros consolidados (case-insensitive)
    const learned = errors.filter(e => {
      const status = (e.error_status || "").toLowerCase().trim()
      return status === "consolidado" || status === "aprendido" || status === "resolvido"
    }).length
    
    // Calcula reincidentes (erros com status "Reincidente" - case-insensitive)
    const reincidentErrors = errors.filter(e => {
      const status = (e.error_status || "").toLowerCase().trim()
      return status === "reincidente"
    }).length

    return {
      total,
      critical,
      learned,
      reincident: reincidentErrors,
      criticalPercent: total > 0 ? Math.round((critical / total) * 100) : 0,
      learnedPercent: total > 0 ? Math.round((learned / total) * 100) : 0,
      reincidentsPercent: total > 0 ? Math.round((reincidentErrors / total) * 100) : 0
    }
  }, [errors])

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

  // STATUS DOS ERROS
  const errorStatuses = useMemo(() => {
    const statusCounts: { [key: string]: number } = {}

    errors.forEach(error => {
      const status = error.error_status || "normal"
      statusCounts[status] = (statusCounts[status] || 0) + 1
    })

    return Object.entries(statusCounts)
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
      {/* CARDS DE RESUMO ACUMULADOS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          onClick={() => router.push("/week-summary?type=total&all=true")}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left transition hover:shadow-md hover:ring-2 hover:ring-slate-300 cursor-pointer"
        >
          <p className="text-sm text-slate-600">Total de Erros</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summaryCards.total}</p>
          <p className="mt-1 text-xs text-slate-500">Acumulado</p>
        </button>
        <button
          onClick={() => router.push("/week-summary?type=critical&all=true")}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left transition hover:shadow-md hover:ring-2 hover:ring-red-300 cursor-pointer"
        >
          <p className="text-sm text-slate-600">Erros Críticos</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{summaryCards.criticalPercent}%</p>
          <p className="mt-1 text-xs text-slate-500">{summaryCards.critical} de {summaryCards.total} erros (acumulado)</p>
        </button>
        <button
          onClick={() => router.push("/week-summary?type=reincident&all=true")}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left transition hover:shadow-md hover:ring-2 hover:ring-orange-300 cursor-pointer"
        >
          <p className="text-sm text-slate-600">Reincidentes</p>
          <p className="mt-1 text-2xl font-bold text-orange-600">{summaryCards.reincidentsPercent}%</p>
          <p className="mt-1 text-xs text-slate-500">{summaryCards.reincident} de {summaryCards.total} erros (acumulado)</p>
        </button>
        <button
          onClick={() => router.push("/week-summary?type=learned&all=true")}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left transition hover:shadow-md hover:ring-2 hover:ring-green-300 cursor-pointer"
        >
          <p className="text-sm text-slate-600">Consolidados</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{summaryCards.learnedPercent}%</p>
          <p className="mt-1 text-xs text-slate-500">{summaryCards.learned} de {summaryCards.total} erros (acumulado)</p>
        </button>
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
          <div style={{ width: "100%", height: 300 }}>
            {errorTypes.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={errorTypes}
                    cx="50%"
                    cy="45%"
                    labelLine={true}
                    label={(props: any) => {
                      const { cx, cy, midAngle, innerRadius, outerRadius, percent, payload } = props
                      // Só mostra label se a porcentagem for maior que 5%
                      if (percent < 0.05) return null
                      
                      const RADIAN = Math.PI / 180
                      const radius = innerRadius + (outerRadius - innerRadius) * 0.7
                      const x = cx + radius * Math.cos(-midAngle * RADIAN)
                      const y = cy + radius * Math.sin(-midAngle * RADIAN)
                      
                      const tipo = payload?.tipo || ""
                      const percentValue = (percent * 100).toFixed(0)
                      
                      return (
                        <text 
                          x={x} 
                          y={y} 
                          fill="#0f172a" 
                          textAnchor={x > cx ? 'start' : 'end'} 
                          dominantBaseline="central"
                          fontSize={11}
                          fontWeight={500}
                        >
                          {`${tipo}: ${percentValue}%`}
                        </text>
                      )
                    }}
                    outerRadius={80}
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
                      padding: "8px 12px"
                    }}
                    formatter={(value: number | undefined, _name: string | undefined, props: any) => {
                      const v = value ?? 0
                      const total = errorTypes.reduce((sum, item) => sum + item.quantidade, 0)
                      const percent = total > 0 ? ((v / total) * 100).toFixed(1) : "0"
                      return [`${v} (${percent}%)`, props.payload.tipo]
                    }}
                    labelFormatter={() => ""}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value, entry: any) => {
                      const total = errorTypes.reduce((sum, item) => sum + item.quantidade, 0)
                      const percent = ((entry.payload.quantidade / total) * 100).toFixed(1)
                      return `${value} (${percent}%)`
                    }}
                    wrapperStyle={{
                      paddingTop: "16px",
                      fontSize: "12px"
                    }}
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
            {errorStatuses.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={errorStatuses}>
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
