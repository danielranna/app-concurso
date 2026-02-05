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
  ReferenceLine
} from "recharts"
import { AlertTriangle, Flag, Settings2, Play, Check, X, ChevronDown, Edit3 } from "lucide-react"

type AnalysisCard = {
  id: string
  error_text: string
  correction_text: string
  error_status: string
  error_type: string
  review_count: number
  status_weight: number
  efficiency: number | null
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

type AnalysisConfig = {
  status_weights: { [key: string]: number }
  review_threshold: number
  efficiency_threshold: number
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
  onStartReview?: (cardIds: string[]) => void
}

const DEFAULT_STATUS_COLOR = "#64748b"

export default function AnalysisTab({ userId, subjects, errorStatuses, onStartReview }: Props) {
  const router = useRouter()

  // Estados principais
  const [cards, setCards] = useState<AnalysisCard[]>([])
  const [stats, setStats] = useState<{
    total: number
    flagged: number
    attention: number
    most_problematic_subject: { name: string; count: number } | null
  }>({ total: 0, flagged: 0, attention: 0, most_problematic_subject: null })
  const [config, setConfig] = useState<AnalysisConfig>({
    status_weights: {},
    review_threshold: 30,
    efficiency_threshold: 0.1,
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

  // Seleção múltipla para ações em lote
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set())

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

  // Dados para o gráfico
  const chartData = useMemo(() => {
    return cards
      .filter(card => card.review_count > 0) // Só mostra cards com revisões
      .map(card => ({
        ...card,
        x: card.review_count,
        y: card.status_weight,
        // Cor baseada no status de atenção/flag
        color: card.needs_intervention 
          ? "#ef4444" // Vermelho para flagados
          : card.needs_attention 
            ? "#f59e0b" // Laranja para zona de atenção
            : "#22c55e" // Verde para ok
      }))
  }, [cards])

  // Maior peso de status (para o eixo Y)
  const maxStatusWeight = useMemo(() => {
    const weights = Object.values(config.status_weights)
    return weights.length > 0 ? Math.max(...weights) + 1 : 5
  }, [config.status_weights])

  // Aplicar flag em cards selecionados
  const applyFlag = async (flag: boolean) => {
    if (selectedCardIds.size === 0) return

    try {
      const res = await fetch("/api/analysis", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          card_ids: Array.from(selectedCardIds),
          needs_intervention: flag
        })
      })

      if (res.ok) {
        setSelectedCardIds(new Set())
        loadAnalysisData()
      }
    } catch (error) {
      console.error("Erro ao aplicar flag:", error)
    }
  }

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

  // Iniciar revisão dos cards problemáticos
  const startProblematicReview = () => {
    const problematicIds = cards
      .filter(c => c.needs_attention || c.needs_intervention)
      .map(c => c.id)
    
    if (problematicIds.length > 0 && onStartReview) {
      onStartReview(problematicIds)
    }
  }

  // Tooltip customizado para o gráfico
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const card = payload[0].payload as AnalysisCard
      return (
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-1 text-sm font-semibold text-slate-800 line-clamp-2">
            {card.error_text}
          </p>
          <div className="space-y-1 text-xs text-slate-600">
            <p><span className="font-medium">Matéria:</span> {card.subject_name}</p>
            <p><span className="font-medium">Status:</span> {card.error_status}</p>
            <p><span className="font-medium">Revisões:</span> {card.review_count}</p>
            <p><span className="font-medium">Eficiência:</span> {card.efficiency?.toFixed(4) || "N/A"}</p>
          </div>
          {(card.needs_attention || card.needs_intervention) && (
            <div className="mt-2 flex items-center gap-1 text-xs font-medium text-red-600">
              <AlertTriangle className="h-3 w-3" />
              {card.needs_intervention ? "Flagado para intervenção" : "Zona de atenção"}
            </div>
          )}
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
            <p className="text-sm text-red-700">Flagados</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-red-700">{stats.flagged}</p>
          <p className="mt-1 text-xs text-red-600">Precisam intervenção</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm text-amber-700">Zona de Atenção</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-700">{stats.attention}</p>
          <p className="mt-1 text-xs text-amber-600">Baixa eficiência</p>
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
          {(stats.flagged > 0 || stats.attention > 0) && (
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

      {/* AÇÕES EM LOTE (quando há seleção) */}
      {selectedCardIds.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 p-4">
          <span className="text-sm font-medium text-blue-800">
            {selectedCardIds.size} card(s) selecionado(s)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => applyFlag(true)}
              className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700"
            >
              <Flag className="h-3 w-3" />
              Flagear
            </button>
            <button
              onClick={() => applyFlag(false)}
              className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-green-700"
            >
              <Check className="h-3 w-3" />
              Remover Flag
            </button>
            <button
              onClick={() => setSelectedCardIds(new Set())}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <X className="h-3 w-3" />
              Limpar
            </button>
          </div>
        </div>
      )}

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

        <div style={{ width: "100%", height: 400 }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Revisões"
                  stroke="#64748b"
                  style={{ fontSize: "12px" }}
                  label={{ value: "Número de Revisões", position: "bottom", offset: 0, style: { fontSize: "12px", fill: "#64748b" } }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Status"
                  stroke="#64748b"
                  style={{ fontSize: "12px" }}
                  domain={[0, maxStatusWeight]}
                  label={{ value: "Peso do Status", angle: -90, position: "insideLeft", style: { fontSize: "12px", fill: "#64748b" } }}
                />
                <Tooltip content={<CustomTooltip />} />
                
                {/* Linha de threshold de revisões */}
                <ReferenceLine
                  x={config.review_threshold}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  label={{ value: `${config.review_threshold} revisões`, position: "top", style: { fontSize: "10px", fill: "#f59e0b" } }}
                />

                <Scatter
                  data={chartData}
                  onClick={(data: any) => {
                    if (data) {
                      setSelectedCard(data)
                    }
                  }}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke={selectedCardIds.has(entry.id) ? "#3b82f6" : "transparent"}
                      strokeWidth={selectedCardIds.has(entry.id) ? 3 : 0}
                      cursor="pointer"
                      onClick={(e: any) => {
                        e.stopPropagation?.()
                        // Toggle seleção
                        setSelectedCardIds(prev => {
                          const next = new Set(prev)
                          if (next.has(entry.id)) {
                            next.delete(entry.id)
                          } else {
                            next.add(entry.id)
                          }
                          return next
                        })
                      }}
                    />
                  ))}
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

      {/* PAINEL DE DETALHES DO CARD */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Detalhes do Card</h3>
              <button
                onClick={() => setSelectedCard(null)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500">Pergunta</label>
                <p className="mt-1 text-sm text-slate-800">{selectedCard.error_text}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500">Resposta</label>
                <p className="mt-1 text-sm text-slate-800">{selectedCard.correction_text}</p>
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
                  <p className="mt-1 text-sm font-semibold text-slate-800">{selectedCard.review_count}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Eficiência</label>
                  <p className={`mt-1 text-sm font-semibold ${
                    selectedCard.efficiency && selectedCard.efficiency < config.efficiency_threshold
                      ? "text-red-600"
                      : "text-green-600"
                  }`}>
                    {selectedCard.efficiency?.toFixed(4) || "N/A"}
                  </p>
                </div>
              </div>

              {selectedCard.needs_intervention && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <Flag className="h-4 w-4" />
                  <span>Este card está flagado para intervenção</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    // Toggle flag
                    const cardIds = [selectedCard.id]
                    fetch("/api/analysis", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        user_id: userId,
                        card_ids: cardIds,
                        needs_intervention: !selectedCard.needs_intervention
                      })
                    }).then(() => {
                      loadAnalysisData()
                      setSelectedCard(null)
                    })
                  }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                    selectedCard.needs_intervention
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "bg-red-600 text-white hover:bg-red-700"
                  }`}
                >
                  <Flag className="h-4 w-4" />
                  {selectedCard.needs_intervention ? "Remover Flag" : "Flagear"}
                </button>
                <button
                  onClick={() => router.push(`/subject/${selectedCard.subject_id}?card=${selectedCard.id}`)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Edit3 className="h-4 w-4" />
                  Editar Card
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAINEL DE CONFIGURAÇÕES */}
      {showConfigPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
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

            <div className="space-y-6">
              {/* Explicação geral */}
              <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
                <p className="font-medium mb-1">Como funciona a análise?</p>
                <p>A eficiência de um card é calculada: <strong>Peso do Status ÷ Número de Revisões</strong>.</p>
                <p className="mt-1">Exemplo: Um card "Consolidado" (peso 4) com 20 revisões tem eficiência de 0.20. Um card "Difícil" (peso 1) com 50 revisões tem eficiência de 0.02 — muito baixa, precisa de atenção.</p>
              </div>

              {/* Pesos dos status */}
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Pesos dos Status
                </label>
                <p className="text-xs text-slate-500 mb-1">
                  Defina um valor numérico para cada status representando seu nível de progresso.
                </p>
                <p className="text-xs text-slate-500 mb-3">
                  <strong>Dica:</strong> Status mais avançados (ex: "Consolidado") devem ter pesos maiores. Status iniciais (ex: "Difícil") devem ter pesos menores.
                </p>
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  {errorStatuses.map((status, index) => (
                    <div key={status.id} className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: status.color || DEFAULT_STATUS_COLOR }}
                      />
                      <span className="flex-1 text-sm text-slate-700">{status.name}</span>
                      <input
                        type="number"
                        value={tempConfig.status_weights[status.name] ?? index}
                        onChange={(e) => {
                          const newWeights = { ...tempConfig.status_weights }
                          newWeights[status.name] = parseInt(e.target.value) || 0
                          setTempConfig({ ...tempConfig, status_weights: newWeights })
                        }}
                        className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm text-center"
                        min={0}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Threshold de revisões */}
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Mínimo de Revisões para Análise
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Só analisa cards com pelo menos este número de revisões. Cards com poucas revisões ainda não têm dados suficientes para avaliar.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={tempConfig.review_threshold}
                    onChange={(e) => setTempConfig({ ...tempConfig, review_threshold: parseInt(e.target.value) || 0 })}
                    className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    min={1}
                  />
                  <span className="text-sm text-slate-500">revisões</span>
                </div>
              </div>

              {/* Threshold de eficiência */}
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Eficiência Mínima Aceitável
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Cards com eficiência abaixo deste valor são considerados problemáticos. Quanto menor o número, mais tolerante.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={tempConfig.efficiency_threshold}
                    onChange={(e) => setTempConfig({ ...tempConfig, efficiency_threshold: parseFloat(e.target.value) || 0 })}
                    className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    min={0}
                    max={1}
                    step={0.01}
                  />
                  <span className="text-xs text-slate-500">(0.05 = muito rígido, 0.2 = moderado, 0.5 = tolerante)</span>
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
                  Sugerir flag automaticamente
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Destaca automaticamente cards que ultrapassam o mínimo de revisões e têm eficiência abaixo do aceitável. Você ainda decide se quer aplicar a flag.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
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
        </div>
      )}
    </div>
  )
}
