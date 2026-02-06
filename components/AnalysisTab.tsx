"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  LabelList,
  Line,
  ComposedChart
} from "recharts"
import { AlertTriangle, Flag, Settings2, Play, X, ChevronDown, Edit3, CheckCircle2 } from "lucide-react"

type AnalysisCard = {
  id: string
  error_text: string
  correction_text: string
  error_status: string
  error_type: string
  review_count: number
  expected_reviews: number
  excess_reviews: number
  status_weight: number
  problem_index: number
  needs_attention: boolean
  needs_intervention: boolean
  intervention_flagged_at: string | null
  intervention_resolved_at: string | null
  created_at: string
  subject_id: string
  subject_name: string
  topic_id: string
  topic_name: string
}

type StatusConfig = {
  weight: number
  expected_reviews: number
}

type AnalysisConfig = {
  status_config: { [key: string]: StatusConfig }
  problem_threshold: number
  outlier_percentage: number
  auto_flag_enabled: boolean
}

type ErrorStatus = {
  id: string
  name: string
  color?: string | null
}

type Subject = {
  id: string
  name: string
}

type Props = {
  userId: string
  subjects: Subject[]
  errorStatuses: ErrorStatus[]
}

const DEFAULT_STATUS_COLOR = "#64748b"

// Função para remover tags HTML e obter texto puro (para tooltips)
function stripHtml(html: string): string {
  if (!html) return ""
  // Remove tags HTML
  const text = html.replace(/<[^>]*>/g, "")
  // Decodifica entidades HTML comuns
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

export default function AnalysisTab({ userId, subjects, errorStatuses }: Props) {
  const router = useRouter()

  // Estados principais
  const [cards, setCards] = useState<AnalysisCard[]>([])
  const [stats, setStats] = useState<{
    total: number
    flagged: number
    outliers: number
    attention_zone: number
    outlier_threshold: number | null
    most_problematic_subject: { name: string; count: number } | null
  }>({ total: 0, flagged: 0, outliers: 0, attention_zone: 0, outlier_threshold: null, most_problematic_subject: null })
  const [config, setConfig] = useState<AnalysisConfig>({
    status_config: {},
    problem_threshold: 10,
    outlier_percentage: 10,
    auto_flag_enabled: true
  })
  const [loading, setLoading] = useState(true)

  // Filtros
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [showOnlyFlagged, setShowOnlyFlagged] = useState(false)
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false)

  // Configurações (painel lateral)
  const [showConfigPanel, setShowConfigPanel] = useState(false)
  const [tempConfig, setTempConfig] = useState<AnalysisConfig>(config)

  // Card selecionado para detalhes
  const [selectedCard, setSelectedCard] = useState<AnalysisCard | null>(null)
  
  // Cards em um ponto (quando há múltiplos no mesmo lugar)
  const [cardsAtPoint, setCardsAtPoint] = useState<AnalysisCard[] | null>(null)

  // Carrega dados de análise
  const loadAnalysisData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ user_id: userId })
      if (selectedSubjectId) params.append("subject_id", selectedSubjectId)
      if (showOnlyFlagged) params.append("only_flagged", "true")

      const res = await fetch(`/api/analysis?${params}`)
      const data = await res.json()

      if (data.error) {
        console.error("Erro ao carregar análise:", data.error)
        return
      }

      setCards(data.cards || [])
      setStats(data.stats || { total: 0, flagged: 0, attention: 0, most_problematic_subject: null })
      setConfig(data.config || config)
      setTempConfig(data.config || config)
    } catch (error) {
      console.error("Erro ao carregar análise:", error)
    } finally {
      setLoading(false)
    }
  }, [userId, selectedSubjectId, showOnlyFlagged])

  useEffect(() => {
    loadAnalysisData()
  }, [loadAnalysisData])

  // Ordena status pelo peso (para eixo Y)
  const statusesByWeight = useMemo(() => {
    return [...errorStatuses].sort((a, b) => {
      const weightA = config.status_config[a.name]?.weight ?? 0
      const weightB = config.status_config[b.name]?.weight ?? 0
      return weightA - weightB // Menor peso embaixo, maior peso em cima
    })
  }, [errorStatuses, config.status_config])

  // Mapa de status -> índice ordenado por peso
  const statusWeightIndexMap = useMemo(() => {
    const map: { [key: string]: number } = {}
    statusesByWeight.forEach((status, index) => {
      map[status.name] = index
    })
    return map
  }, [statusesByWeight])

  // Calcula o percentil de outliers (baseado na porcentagem configurada)
  // IMPORTANTE: só considera outliers entre cards que JÁ passaram do threshold
  const outlierThreshold = useMemo(() => {
    const threshold = Number(config.problem_threshold) || 10
    
    // Filtra apenas cards com índice >= threshold (já são problemáticos)
    const indices = cards
      .map(c => Number(c.problem_index) || 0)
      .filter(idx => idx >= threshold) // Só considera cards acima do threshold
      .sort((a, b) => a - b)
    
    if (indices.length === 0) return Infinity
    
    // Ex: outlier_percentage = 10 significa top 10% dos problemáticos
    const percentile = (100 - config.outlier_percentage) / 100
    const index = Math.floor(indices.length * percentile)
    return indices[index] || indices[indices.length - 1]
  }, [cards, config.outlier_percentage, config.problem_threshold])

  // Dados para o gráfico de Índice vs Revisões (identificar real problema)
  const problemChartData = useMemo(() => {
    // Filtra apenas cards com revisões
    const dataPoints = cards
      .filter(card => card.review_count > 0)
      .map(card => ({
        ...card,
        x: card.review_count,
        y: card.problem_index || 0
      }))
    
    if (dataPoints.length < 2) {
      return { points: dataPoints, trendLine: [], slope: 0, intercept: 0 }
    }
    
    // Calcula regressão linear (y = mx + b)
    const n = dataPoints.length
    const sumX = dataPoints.reduce((acc, p) => acc + p.x, 0)
    const sumY = dataPoints.reduce((acc, p) => acc + p.y, 0)
    const sumXY = dataPoints.reduce((acc, p) => acc + p.x * p.y, 0)
    const sumXX = dataPoints.reduce((acc, p) => acc + p.x * p.x, 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0
    const intercept = (sumY - slope * sumX) / n || 0
    
    // Calcula o erro padrão para identificar outliers
    const errors = dataPoints.map(p => {
      const expected = slope * p.x + intercept
      return Math.abs(p.y - expected)
    })
    const meanError = errors.reduce((a, b) => a + b, 0) / errors.length
    const stdError = Math.sqrt(
      errors.reduce((acc, e) => acc + Math.pow(e - meanError, 2), 0) / errors.length
    ) || 1
    
    // Marca pontos como outliers (> 1.5 desvios padrão acima da linha)
    const pointsWithDeviation = dataPoints.map(p => {
      const expected = slope * p.x + intercept
      const deviation = p.y - expected
      const normalizedDeviation = deviation / stdError
      
      // Cor baseada no desvio da tendência
      let color = "#22c55e" // Verde - abaixo ou na tendência
      if (normalizedDeviation > 2) {
        color = "#ef4444" // Vermelho - muito acima da tendência
      } else if (normalizedDeviation > 1) {
        color = "#f59e0b" // Laranja - acima da tendência
      }
      
      // Se já está flagado, sempre vermelho
      if (p.needs_intervention) {
        color = "#ef4444"
      }
      
      return {
        ...p,
        expected,
        deviation,
        normalizedDeviation,
        color
      }
    })
    
    // Gera pontos para a linha de tendência
    const minX = Math.min(...dataPoints.map(p => p.x))
    const maxX = Math.max(...dataPoints.map(p => p.x))
    const trendLine = [
      { x: minX, y: Math.max(0, slope * minX + intercept) },
      { x: maxX, y: Math.max(0, slope * maxX + intercept) }
    ]
    
    return { points: pointsWithDeviation, trendLine, slope, intercept, stdError }
  }, [cards])

  // Dados para o gráfico - agrupados por posição (x, y)
  const chartData = useMemo(() => {
    const threshold = Number(config.problem_threshold) || 10
    
    // Primeiro, processa todos os cards
    const processedCards = cards
      .filter(card => card.review_count > 0) // Só mostra cards com revisões
      .map(card => {
        // Cor baseada SOMENTE no ÍNDICE DE PROBLEMA
        const problemIdx = Number(card.problem_index) || 0
        
        let color = "#22c55e" // Verde por padrão (índice = 0)
        
        if (card.needs_intervention) {
          color = "#ef4444" // Vermelho - flagado (Zona Crítica)
        } else if (problemIdx >= outlierThreshold && problemIdx > 0) {
          color = "#ef4444" // Vermelho - outlier (Zona Crítica)
        } else if (problemIdx >= threshold) {
          color = "#f59e0b" // Laranja - acima do threshold
        }
        // Se índice < threshold ou índice = 0, fica verde
        
        return {
          ...card,
          x: card.review_count,
          y: statusWeightIndexMap[card.error_status] ?? 0,
          color,
          isOutlier: problemIdx >= outlierThreshold && problemIdx > 0
        }
      })
    
    // Agrupa cards pelo mesmo ponto (x, y)
    const groupedByPosition: { [key: string]: typeof processedCards } = {}
    processedCards.forEach(card => {
      const key = `${card.x}-${card.y}`
      if (!groupedByPosition[key]) {
        groupedByPosition[key] = []
      }
      groupedByPosition[key].push(card)
    })
    
    // Cria um ponto representativo para cada grupo
    return Object.values(groupedByPosition).map(group => {
      // Ordena o grupo por problem_index (mais problemático primeiro)
      group.sort((a, b) => (b.problem_index || 0) - (a.problem_index || 0))
      
      // Usa a cor mais "grave" do grupo
      let groupColor = "#22c55e" // Verde
      const hasRed = group.some(c => c.color === "#ef4444")
      const hasOrange = group.some(c => c.color === "#f59e0b")
      if (hasRed) groupColor = "#ef4444"
      else if (hasOrange) groupColor = "#f59e0b"
      
      const hasFlagged = group.some(c => c.needs_intervention)
      
      return {
        ...group[0], // Usa o primeiro card como base
        color: groupColor,
        groupCount: group.length,
        allCards: group, // Guarda todos os cards do grupo
        hasFlagged
      }
    })
  }, [cards, statusWeightIndexMap, config.problem_threshold, outlierThreshold])

  // Salvar configurações
  const saveConfig = async () => {
    try {
      await fetch("/api/user-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          analysis_config: tempConfig
        })
      })
      setConfig(tempConfig)
      setShowConfigPanel(false)
      loadAnalysisData()
    } catch (error) {
      console.error("Erro ao salvar configurações:", error)
    }
  }

  // Iniciar revisão dos cards problemáticos - redireciona para resumo-periodo com filtro de flagged
  const startProblematicReview = () => {
    // Redireciona para a página de resumo com filtro de flagados ativo
    router.push("/resumo-periodo?flagged=true&period=accumulated")
  }

  // Tooltip customizado para o gráfico
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload as AnalysisCard & { groupCount: number; allCards: AnalysisCard[]; hasFlagged: boolean }
      const count = point.groupCount || 1
      
      // Se há múltiplos cards no ponto
      if (count > 1) {
        const flaggedCount = point.allCards?.filter(c => c.needs_intervention).length || 0
        const problemCount = point.allCards?.filter(c => c.problem_index > 0).length || 0
        
        return (
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg max-w-xs">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                {count}
              </span>
              <span className="text-sm font-semibold text-slate-800">cards neste ponto</span>
            </div>
            <div className="space-y-1 text-xs text-slate-600">
              <p><span className="font-medium">Status:</span> {point.error_status}</p>
              <p><span className="font-medium">Revisões:</span> {point.review_count}</p>
              {flaggedCount > 0 && (
                <p className="text-red-600">
                  <span className="font-medium">{flaggedCount}</span> na Zona Crítica
                </p>
              )}
              {problemCount > 0 && (
                <p className="text-amber-600">
                  <span className="font-medium">{problemCount}</span> com excesso de revisões
                </p>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400 italic">Clique para escolher qual visualizar</p>
          </div>
        )
      }
      
      // Card único
      const cleanErrorText = stripHtml(point.error_text)
      return (
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg max-w-xs">
          <p className="mb-1 text-sm font-semibold text-slate-800 line-clamp-2">
            {cleanErrorText || "Sem texto"}
          </p>
          <div className="space-y-1 text-xs text-slate-600">
            <p><span className="font-medium">Matéria:</span> {point.subject_name}</p>
            <p><span className="font-medium">Status:</span> {point.error_status}</p>
            <p><span className="font-medium">Revisões:</span> {point.review_count} / {point.expected_reviews} esperadas</p>
            {point.excess_reviews > 0 && (
              <p className="text-amber-600">
                <span className="font-medium">Excesso:</span> +{point.excess_reviews} revisões
              </p>
            )}
            {point.problem_index > 0 && (
              <p className="text-red-600">
                <span className="font-medium">Índice de Problema:</span> {point.problem_index}
              </p>
            )}
          </div>
          {(point.needs_attention || point.needs_intervention) && (
            <div className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600">
              <AlertTriangle className="h-3 w-3" />
              {point.needs_intervention ? "Flagado para intervenção" : "Excedeu revisões esperadas"}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-400 italic">Clique para ver detalhes</p>
        </div>
      )
    }
    return null
  }

  // Mapeamento de status para cor
  const getStatusColor = (statusName: string) => {
    const status = errorStatuses.find(s => s.name === statusName)
    return status?.color || DEFAULT_STATUS_COLOR
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-500">Carregando análise...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* RESUMO RÁPIDO */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Total de Cards</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</p>
          <p className="mt-1 text-xs text-slate-500">Com revisões</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-red-600" />
            <p className="text-sm text-red-700">Zona Crítica</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-red-700">{stats.flagged + stats.outliers}</p>
          <p className="mt-1 text-xs text-red-600">
            {stats.flagged > 0 && `${stats.flagged} flagados`}
            {stats.flagged > 0 && stats.outliers > 0 && " + "}
            {stats.outliers > 0 && `${stats.outliers} outliers (top ${config.outlier_percentage}%)`}
            {stats.flagged === 0 && stats.outliers === 0 && "Nenhum"}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm text-amber-700">Zona de Atenção</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-700">{stats.attention_zone}</p>
          <p className="mt-1 text-xs text-amber-600">
            Índice ≥ {config.problem_threshold}
          </p>
        </div>
        {stats.most_problematic_subject && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Matéria Crítica</p>
            <p className="mt-1 text-lg font-bold text-slate-900 truncate">
              {stats.most_problematic_subject.name}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {stats.most_problematic_subject.count} cards problemáticos
            </p>
          </div>
        )}
      </div>

      {/* FILTROS E AÇÕES */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro por matéria */}
          <div className="relative">
            <button
              onClick={() => setIsSubjectDropdownOpen(!isSubjectDropdownOpen)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium transition hover:bg-slate-50"
            >
              <span className="text-slate-700">
                {selectedSubjectId 
                  ? subjects.find(s => s.id === selectedSubjectId)?.name || "Matéria"
                  : "Todas as matérias"}
              </span>
              <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isSubjectDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isSubjectDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsSubjectDropdownOpen(false)} />
                <div className="absolute left-0 z-20 mt-1 max-h-60 w-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={() => {
                      setSelectedSubjectId(null)
                      setIsSubjectDropdownOpen(false)
                    }}
                    className={`flex w-full items-center px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                      !selectedSubjectId ? 'bg-slate-100' : ''
                    }`}
                  >
                    Todas as matérias
                    {!selectedSubjectId && <span className="ml-auto text-slate-400">✓</span>}
                  </button>
                  {subjects.map((subject) => (
                    <button
                      key={subject.id}
                      onClick={() => {
                        setSelectedSubjectId(subject.id)
                        setIsSubjectDropdownOpen(false)
                      }}
                      className={`flex w-full items-center px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                        selectedSubjectId === subject.id ? 'bg-slate-100' : ''
                      }`}
                    >
                      {subject.name}
                      {selectedSubjectId === subject.id && <span className="ml-auto text-slate-400">✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Toggle só flagados */}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm transition hover:bg-slate-50">
            <input
              type="checkbox"
              checked={showOnlyFlagged}
              onChange={(e) => setShowOnlyFlagged(e.target.checked)}
              className="rounded border-slate-300"
            />
            <Flag className="h-4 w-4 text-red-500" />
            <span className="text-slate-700">Só flagados</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de configurações */}
          <button
            onClick={() => setShowConfigPanel(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Settings2 className="h-4 w-4" />
            Configurar
          </button>

          {/* Botão de revisar problemáticos */}
          {(stats.flagged > 0 || stats.outliers > 0 || stats.attention_zone > 0) && (
            <button
              onClick={startProblematicReview}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <Play className="h-4 w-4" />
              Revisar Problemáticos
            </button>
          )}
        </div>
      </div>

      {/* GRÁFICO DE DISPERSÃO */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              Análise de Eficiência
            </h3>
            <p className="text-sm text-slate-500">
              Clique em um ponto para ver detalhes. Zona vermelha = precisa atenção.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-slate-600">OK</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full bg-amber-500" />
              <span className="text-slate-600">Atenção</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-slate-600">Flagado</span>
            </div>
          </div>
        </div>

        <div style={{ width: "100%", height: Math.max(400, errorStatuses.length * 60) }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Revisões"
                  stroke="#64748b"
                  style={{ fontSize: "12px" }}
                  label={{ value: "Número de Revisões", position: "bottom", offset: 10, style: { fontSize: "12px", fill: "#64748b" } }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Status"
                  stroke="#64748b"
                  style={{ fontSize: "11px" }}
                  domain={[-0.5, statusesByWeight.length - 0.5]}
                  ticks={statusesByWeight.map((_, i) => i)}
                  tickFormatter={(value) => {
                    const status = statusesByWeight[value]
                    if (!status) return ""
                    const weight = config.status_config[status.name]?.weight ?? 0
                    return `${status.name} (${weight})`
                  }}
                  width={120}
                />
                <Tooltip content={<CustomTooltip />} />
                
                {/* Linha de referência - mediana das revisões dos cards em excesso */}
                {(() => {
                  // Filtra apenas cards com excesso > 0
                  const cardsWithExcess = cards.filter(c => c.excess_reviews > 0)
                  if (cardsWithExcess.length === 0) return null
                  
                  // Calcula mediana do review_count dos cards em excesso
                  // Isso representa onde está o card problemático "típico" no eixo X
                  const reviewCounts = cardsWithExcess
                    .map(c => c.review_count)
                    .sort((a, b) => a - b)
                  const mid = Math.floor(reviewCounts.length / 2)
                  const medianReviews = reviewCounts.length % 2 === 0
                    ? (reviewCounts[mid - 1] + reviewCounts[mid]) / 2
                    : reviewCounts[mid]
                  
                  return (
                    <ReferenceLine
                      x={medianReviews}
                      stroke="#f59e0b"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      label={{ 
                        value: `Mediana: ${medianReviews} rev.`, 
                        position: "top", 
                        style: { fontSize: "10px", fill: "#f59e0b" } 
                      }}
                    />
                  )
                })()}

                <Scatter
                  data={chartData}
                  onClick={(data: any) => {
                    if (data) {
                      const point = data as { groupCount?: number; allCards?: AnalysisCard[] }
                      // Se há múltiplos cards no ponto, abre o seletor
                      if (point.groupCount && point.groupCount > 1 && point.allCards) {
                        setCardsAtPoint(point.allCards)
                      } else {
                        // Card único, abre direto
                        setSelectedCard(data)
                      }
                    }
                  }}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke={entry.hasFlagged ? "#991b1b" : "transparent"}
                      strokeWidth={entry.hasFlagged ? 2 : 0}
                      cursor="pointer"
                    />
                  ))}
                  <LabelList 
                    dataKey="groupCount" 
                    position="top"
                    offset={8}
                    formatter={(value) => {
                      const num = Number(value)
                      return num > 1 ? num : ""
                    }}
                    style={{ 
                      fontSize: "11px", 
                      fontWeight: "bold",
                      fill: "#374151"
                    }}
                  />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500">
              <p>Nenhum card com revisões encontrado</p>
              <p className="text-sm text-slate-400">Os cards aparecerão aqui após serem revisados</p>
            </div>
          )}
        </div>
      </div>

      {/* GRÁFICO DE ÍNDICE VS REVISÕES */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">
              Diagnóstico de Problemas
            </h3>
            <p className="text-sm text-slate-500">
              Cards acima da linha de tendência indicam problemas reais de aprendizado
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-slate-600">Normal</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full bg-amber-500" />
              <span className="text-slate-600">+1σ</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-slate-600">+2σ (outlier)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-0.5 w-6 bg-blue-500" style={{ borderStyle: 'dashed' }} />
              <span className="text-slate-600">Tendência</span>
            </div>
          </div>
        </div>

        <div style={{ width: "100%", height: 400 }}>
          {problemChartData.points.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 20, right: 20, bottom: 40, left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Revisões"
                  stroke="#64748b"
                  style={{ fontSize: "12px" }}
                  label={{ value: "Número de Revisões", position: "bottom", offset: 10, style: { fontSize: "12px", fill: "#64748b" } }}
                  domain={['dataMin - 1', 'dataMax + 1']}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Índice"
                  stroke="#64748b"
                  style={{ fontSize: "12px" }}
                  label={{ value: "Índice de Problema (peso × excesso)", angle: -90, position: "insideLeft", style: { fontSize: "12px", fill: "#64748b", textAnchor: "middle" } }}
                  domain={[0, 'dataMax + 5']}
                />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (active && payload && payload.length) {
                      const point = payload[0].payload
                      if (point.trendPoint) return null // Não mostra tooltip para linha de tendência
                      
                      const cleanErrorText = stripHtml(point.error_text || "")
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg max-w-xs">
                          <p className="mb-1 text-sm font-semibold text-slate-800 line-clamp-2">
                            {cleanErrorText || "Sem texto"}
                          </p>
                          <div className="space-y-1 text-xs text-slate-600">
                            <p><span className="font-medium">Matéria:</span> {point.subject_name}</p>
                            <p><span className="font-medium">Status:</span> {point.error_status} (peso: {point.status_weight})</p>
                            <p><span className="font-medium">Revisões:</span> {point.review_count}</p>
                            <p><span className="font-medium">Índice:</span> {point.problem_index}</p>
                            <div className="pt-1 border-t border-slate-100 mt-1">
                              <p><span className="font-medium">Esperado (tendência):</span> {point.expected?.toFixed(1)}</p>
                              <p className={point.deviation > 0 ? "text-red-600" : "text-green-600"}>
                                <span className="font-medium">Desvio:</span> {point.deviation > 0 ? "+" : ""}{point.deviation?.toFixed(1)}
                                {point.normalizedDeviation !== undefined && (
                                  <span className="ml-1">({point.normalizedDeviation > 0 ? "+" : ""}{point.normalizedDeviation?.toFixed(1)}σ)</span>
                                )}
                              </p>
                            </div>
                          </div>
                          {point.normalizedDeviation > 1 && (
                            <div className="mt-2 text-xs font-medium text-amber-600">
                              ⚠️ Acima da tendência - possível problema real
                            </div>
                          )}
                          <p className="mt-2 text-xs text-slate-400 italic">Clique para ver detalhes</p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                
                {/* Linha de tendência */}
                <Line
                  data={problemChartData.trendLine}
                  type="linear"
                  dataKey="y"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  dot={false}
                  activeDot={false}
                  legendType="none"
                  isAnimationActive={false}
                />

                {/* Pontos dos cards */}
                <Scatter
                  data={problemChartData.points}
                  onClick={(data: any) => {
                    if (data) {
                      setSelectedCard(data)
                    }
                  }}
                >
                  {problemChartData.points.map((entry, index) => (
                    <Cell
                      key={`cell-problem-${index}`}
                      fill={entry.color}
                      stroke={entry.needs_intervention ? "#991b1b" : "transparent"}
                      strokeWidth={entry.needs_intervention ? 2 : 0}
                      cursor="pointer"
                    />
                  ))}
                </Scatter>
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-500">
              <p>Nenhum card com revisões encontrado</p>
              <p className="text-sm text-slate-400">Os cards aparecerão aqui após serem revisados</p>
            </div>
          )}
        </div>

        {/* Insights sobre os outliers */}
        {problemChartData.points.filter(p => (p.normalizedDeviation ?? 0) > 1.5).length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-4">
            <h4 className="text-sm font-semibold text-amber-800 mb-2">
              📊 Análise da Tendência
            </h4>
            <div className="text-xs text-amber-700 space-y-1">
              <p>
                <strong>Cards problemáticos identificados:</strong>{" "}
                {problemChartData.points.filter(p => (p.normalizedDeviation ?? 0) > 1.5).length} cards
                estão significativamente acima da linha de tendência.
              </p>
              <p>
                Esses cards têm um índice de problema maior do que esperado para seu número de revisões,
                indicando possível dificuldade real de aprendizado (não apenas muitas revisões).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* SELETOR DE CARDS (quando há múltiplos no mesmo ponto) */}
      {cardsAtPoint && cardsAtPoint.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCardsAtPoint(null)}>
          <div className="w-full max-w-md max-h-[80vh] flex flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white">
                  {cardsAtPoint.length}
                </span>
                <h3 className="text-lg font-semibold text-slate-800">cards neste ponto</h3>
              </div>
              <button
                onClick={() => setCardsAtPoint(null)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              <p className="px-2 pb-2 text-xs text-slate-500">Selecione um card para ver os detalhes:</p>
              <div className="space-y-1">
                {cardsAtPoint.map((card, index) => {
                  const cleanText = stripHtml(card.error_text)
                  return (
                    <button
                      key={card.id}
                      onClick={() => {
                        setSelectedCard(card as any)
                        setCardsAtPoint(null)
                      }}
                      className={`w-full rounded-lg border p-3 text-left transition hover:bg-slate-50 ${
                        card.needs_intervention 
                          ? "border-red-300 bg-red-50/50" 
                          : card.problem_index > 0 
                            ? "border-amber-300 bg-amber-50/50"
                            : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 line-clamp-2">
                            {cleanText || "Sem texto"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {card.subject_name} • {card.topic_name}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {card.needs_intervention && (
                            <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                              <Flag className="h-3 w-3" />
                              Crítico
                            </span>
                          )}
                          {card.problem_index > 0 && !card.needs_intervention && (
                            <span className="text-xs font-medium text-amber-600">
                              Índice: {card.problem_index}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAINEL DE DETALHES DO CARD */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedCard(null)}>
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Detalhes do Card</h3>
                <p className="text-sm text-slate-500">{selectedCard.topic_name}</p>
              </div>
              <button
                onClick={() => setSelectedCard(null)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Erro */}
              <div>
                <label className="text-xs font-semibold text-red-600">Erro</label>
                <div 
                  className="mt-1 text-sm text-slate-800 leading-relaxed prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedCard.error_text }}
                />
              </div>

              {/* Correção */}
              <div className="rounded-lg bg-green-50 p-3">
                <label className="text-xs font-semibold text-green-700">Correção</label>
                <div 
                  className="mt-1 text-sm text-slate-800 leading-relaxed prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedCard.correction_text }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-500">Matéria</label>
                  <p className="mt-1 text-sm text-slate-800">{selectedCard.subject_name}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Status</label>
                  <p className="mt-1 flex items-center gap-2 text-sm">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: getStatusColor(selectedCard.error_status) }}
                    />
                    <span className="text-slate-800">{selectedCard.error_status}</span>
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Revisões</label>
                  <p className="mt-1 text-sm text-slate-800">
                    <span className="font-semibold">{selectedCard.review_count}</span>
                    <span className="text-slate-500"> / {selectedCard.expected_reviews} esperadas</span>
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Excesso</label>
                  <p className={`mt-1 text-sm font-semibold ${
                    selectedCard.excess_reviews > 0 ? "text-amber-600" : "text-green-600"
                  }`}>
                    {selectedCard.excess_reviews > 0 ? `+${selectedCard.excess_reviews}` : "0"}
                  </p>
                </div>
              </div>

              {selectedCard.problem_index > 0 && (
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-sm text-amber-800">
                    <span className="font-medium">Índice de Problema:</span> {selectedCard.problem_index}
                    <span className="text-amber-600 text-xs ml-2">
                      ({selectedCard.excess_reviews} excesso × {selectedCard.status_weight} peso)
                    </span>
                  </p>
                </div>
              )}

              {selectedCard.needs_intervention && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <Flag className="h-4 w-4" />
                  <span>Este card está flagado para intervenção</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 p-6 pt-4 border-t border-slate-200">
              {/* Botão principal: Revisado */}
              <button
                onClick={async () => {
                  try {
                    // Incrementa o review_count usando a API de errors
                    const res = await fetch(`/api/errors/${selectedCard.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        increment_review: true
                      })
                    })
                    
                    if (res.ok) {
                      // Atualiza os dados e fecha o modal
                      loadAnalysisData()
                      setSelectedCard(null)
                    }
                  } catch (error) {
                    console.error("Erro ao marcar como revisado:", error)
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                Revisado
              </button>
              
              {/* Botões secundários */}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      // Toggle flag de Zona Crítica
                      const res = await fetch("/api/analysis", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          user_id: userId,
                          card_ids: [selectedCard.id],
                          needs_intervention: !selectedCard.needs_intervention
                        })
                      })
                      
                      if (res.ok) {
                        loadAnalysisData()
                        setSelectedCard(null)
                      }
                    } catch (error) {
                      console.error("Erro ao alterar flag:", error)
                    }
                  }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                    selectedCard.needs_intervention
                      ? "border border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                      : "border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                  }`}
                >
                  <Flag className="h-4 w-4" />
                  {selectedCard.needs_intervention ? "Remover da Zona Crítica" : "Zona Crítica"}
                </button>
                <button
                  onClick={() => router.push(`/subject/${selectedCard.subject_id}?card=${selectedCard.id}`)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Edit3 className="h-4 w-4" />
                  Editar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAINEL DE CONFIGURAÇÕES */}
      {showConfigPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">Configurações de Análise</h3>
              <button
                onClick={() => {
                  setTempConfig(config)
                  setShowConfigPanel(false)
                }}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Explicação geral */}
              <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
                <p className="font-medium mb-1">Como funciona a análise?</p>
                <p>Cada status tem um número de <strong>revisões esperadas</strong>. Quando um card ultrapassa esse limite, o <strong>excesso</strong> é multiplicado pelo <strong>peso</strong>.</p>
                <p className="mt-1">Exemplo: Status "Normal" espera 3 revisões (peso 2). Se um card tem 7 revisões, o excesso é 4. Índice de problema = 4 × 2 = <strong>8</strong>.</p>
              </div>

              {/* Configuração por status */}
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Configuração por Status
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  Defina quantas revisões são esperadas para cada status e o peso do excesso. Status problemáticos devem ter menos revisões esperadas e peso maior.
                </p>
                
                {/* Cabeçalho da tabela */}
                <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 border-b border-slate-200">
                  <span className="flex-1">Status</span>
                  <span className="w-20 text-center">Esperadas</span>
                  <span className="w-16 text-center">Peso</span>
                </div>
                
                <div className="space-y-1 rounded-lg border border-slate-200 p-2">
                  {errorStatuses.map((status, index) => {
                    const statusConfig = tempConfig.status_config[status.name] || {
                      expected_reviews: 5,
                      weight: errorStatuses.length - 1 - index
                    }
                    return (
                      <div key={status.id} className="flex items-center gap-2 py-1">
                        <span
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: status.color || DEFAULT_STATUS_COLOR }}
                        />
                        <span className="flex-1 text-sm text-slate-700 truncate">{status.name}</span>
                        <input
                          type="number"
                          value={statusConfig.expected_reviews}
                          onChange={(e) => {
                            const newConfig = { ...tempConfig.status_config }
                            newConfig[status.name] = {
                              ...statusConfig,
                              expected_reviews: parseInt(e.target.value) || 1
                            }
                            setTempConfig({ ...tempConfig, status_config: newConfig })
                          }}
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm text-center"
                          min={1}
                          placeholder="Esperadas"
                        />
                        <input
                          type="number"
                          value={statusConfig.weight}
                          onChange={(e) => {
                            const newConfig = { ...tempConfig.status_config }
                            newConfig[status.name] = {
                              ...statusConfig,
                              weight: parseFloat(e.target.value) || 0
                            }
                            setTempConfig({ ...tempConfig, status_config: newConfig })
                          }}
                          className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm text-center"
                          min={0}
                          step={0.1}
                          placeholder="Peso"
                        />
                      </div>
                    )
                  })}
                </div>
                
                <p className="mt-2 text-xs text-slate-400">
                  <strong>Dica:</strong> "Consolidado" pode ter peso 0 (nunca gera índice). "Difícil" pode ter poucas revisões esperadas e peso alto.
                </p>
              </div>

              {/* Threshold do índice (laranja) */}
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Threshold de Atenção
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Cards com índice ≥ threshold ficam laranja. Abaixo disso ficam verdes.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={tempConfig.problem_threshold}
                    onChange={(e) => setTempConfig({ ...tempConfig, problem_threshold: parseInt(e.target.value) || 0 })}
                    className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    min={1}
                  />
                  <span className="text-xs text-slate-500">(ex: 5 = rígido, 10 = moderado, 20 = tolerante)</span>
                </div>
              </div>

              {/* Porcentagem de outliers (vermelho) */}
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Zona Crítica (outliers)
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Os top X% com maior índice são considerados outliers e ficam vermelhos (Zona Crítica).
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={tempConfig.outlier_percentage}
                    onChange={(e) => setTempConfig({ ...tempConfig, outlier_percentage: Math.max(1, Math.min(50, parseInt(e.target.value) || 10)) })}
                    className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    min={1}
                    max={50}
                  />
                  <span className="text-xs text-slate-500">% (ex: 10 = top 10%, 20 = top 20%)</span>
                </div>
              </div>

              {/* Flag automática */}
              <div className="rounded-lg border border-slate-200 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={tempConfig.auto_flag_enabled}
                    onChange={(e) => setTempConfig({ ...tempConfig, auto_flag_enabled: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  Flag automática para Zona Crítica
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Outliers (top {tempConfig.outlier_percentage}%) são automaticamente flagados no banco.
                </p>
              </div>
            </div>

            {/* Botões fixos no rodapé */}
            <div className="flex gap-2 p-6 pt-4 border-t border-slate-200">
              <button
                onClick={() => {
                  setTempConfig(config)
                  setShowConfigPanel(false)
                }}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveConfig}
                className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
