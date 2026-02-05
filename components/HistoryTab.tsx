"use client"

import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { ChevronDown } from "lucide-react"

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
  savedStatusId?: string
  onStatusChange?: (statusId: string) => void
}

const COLORS = ['#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8']
const DEFAULT_STATUS_COLOR = "#64748b"

export default function HistoryTab({ errors, errorStatuses, onSubjectClick, savedStatusId, onStatusChange }: Props) {
  const router = useRouter()
  
  // Estado para o status selecionado no gráfico de matérias por status
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null)
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false)
  
  // Inicializa o status selecionado quando os errorStatuses carregam
  useEffect(() => {
    if (errorStatuses.length > 0 && !selectedStatusId) {
      // Primeiro tenta usar a preferência salva
      if (savedStatusId && errorStatuses.some(s => s.id === savedStatusId)) {
        setSelectedStatusId(savedStatusId)
        return
      }
      
      // Se não houver preferência, tenta encontrar um status que tenha erros associados
      const statusWithErrors = errorStatuses.find(status => 
        errors.some(e => (e.error_status || "").toLowerCase().trim() === (status.name || "").toLowerCase().trim())
      )
      // Se não encontrar, usa o primeiro status disponível
      setSelectedStatusId(statusWithErrors?.id || errorStatuses[0]?.id || null)
    }
  }, [errorStatuses, errors, selectedStatusId, savedStatusId])

  // Atualiza quando a preferência salva muda
  useEffect(() => {
    if (savedStatusId && errorStatuses.some(s => s.id === savedStatusId)) {
      setSelectedStatusId(savedStatusId)
    }
  }, [savedStatusId, errorStatuses])
  
  // Status atualmente selecionado
  const selectedStatus = useMemo(() => {
    return errorStatuses.find(s => s.id === selectedStatusId) || errorStatuses[0] || null
  }, [errorStatuses, selectedStatusId])

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

  // ERROS POR MATÉRIA PARA O STATUS SELECIONADO (dinâmico)
  const subjectsBySelectedStatus = useMemo(() => {
    if (!selectedStatus) return []
    
    const subjectErrors: { [key: string]: number } = {}
    const selectedStatusName = (selectedStatus.name || "").toLowerCase().trim()
    
    // Conta apenas erros com o status selecionado
    errors.forEach(error => {
      const status = (error.error_status || "").toLowerCase().trim()
      if (status === selectedStatusName) {
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
  }, [errors, selectedStatus])

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
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left transition hover:shadow-md hover:ring-2 hover:ring-[var(--status-color)] cursor-pointer"
              style={{ ['--status-color' as string]: color, borderLeftWidth: 4, borderLeftColor: color }}
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

      {/* ERROS POR MATÉRIA - STATUS SELECIONADO */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            Matérias por Status (Histórico)
          </h3>
          
          {/* Dropdown para selecionar o status */}
          {errorStatuses.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50"
                style={{ 
                  borderLeftWidth: 4, 
                  borderLeftColor: selectedStatus?.color || DEFAULT_STATUS_COLOR 
                }}
              >
                <span 
                  className="h-3 w-3 rounded-full" 
                  style={{ backgroundColor: selectedStatus?.color || DEFAULT_STATUS_COLOR }}
                />
                <span className="text-slate-700">{selectedStatus?.name || "Selecionar status"}</span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isStatusDropdownOpen && (
                <>
                  {/* Overlay para fechar o dropdown ao clicar fora */}
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setIsStatusDropdownOpen(false)}
                  />
                  
                  {/* Dropdown menu */}
                  <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {errorStatuses.map((status) => {
                      const isSelected = status.id === selectedStatusId
                      const statusColor = status.color || DEFAULT_STATUS_COLOR
                      return (
                        <button
                          key={status.id}
                          onClick={() => {
                            setSelectedStatusId(status.id)
                            setIsStatusDropdownOpen(false)
                            // Salva a preferência
                            if (onStatusChange) {
                              onStatusChange(status.id)
                            }
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                            isSelected ? 'bg-slate-100' : ''
                          }`}
                        >
                          <span 
                            className="h-3 w-3 rounded-full" 
                            style={{ backgroundColor: statusColor }}
                          />
                          <span className="text-slate-700">{status.name}</span>
                          {isSelected && (
                            <span className="ml-auto text-slate-400">✓</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        
        <div style={{ width: "100%", height: Math.max(250, subjectsBySelectedStatus.length * 50) }}>
          {subjectsBySelectedStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectsBySelectedStatus} layout="vertical">
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
                  formatter={(value: number | undefined) => [value ?? 0, selectedStatus?.name || "Quantidade"]}
                />
                <Bar 
                  dataKey="quantidade" 
                  fill={selectedStatus?.color || DEFAULT_STATUS_COLOR}
                  radius={[0, 8, 8, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500">
              <p>Nenhum erro com status "{selectedStatus?.name || '...'}"</p>
              <p className="text-sm text-slate-400">Selecione outro status para visualizar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
