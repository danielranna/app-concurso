"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

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

type Subject = {
  id: string
  name: string
}

type Props = {
  errors: Error[]
  subjects: Subject[]
  onSubjectClick: (subjectId: string) => void
}

export default function WeekTab({ errors, subjects, onSubjectClick }: Props) {
  const router = useRouter()

  // Calcula início da semana atual (Segunda-feira)
  const getWeekStart = (date: Date): Date => {
    const dayOfWeek = date.getDay()
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Segunda = 0
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - diff)
    weekStart.setHours(0, 0, 0, 0)
    return weekStart
  }

  // Filtra erros da semana atual
  const weekErrors = useMemo(() => {
    const now = new Date()
    const weekStart = getWeekStart(now)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    return errors.filter(error => {
      const errorDate = new Date(error.created_at)
      return errorDate >= weekStart && errorDate <= weekEnd
    })
  }, [errors])

  // CARDS DE RESUMO
  const summaryCards = useMemo(() => {
    const total = weekErrors.length
    // Filtra erros críticos (case-insensitive e aceita variações)
    const critical = weekErrors.filter(e => {
      const status = (e.error_status || "").toLowerCase().trim()
      return status === "critico" || status === "crítico" || status.includes("critic")
    }).length
    // Filtra erros consolidados (case-insensitive)
    const learned = weekErrors.filter(e => {
      const status = (e.error_status || "").toLowerCase().trim()
      return status === "consolidado" || status === "aprendido" || status === "resolvido"
    }).length
    
    // Calcula reincidentes (erros com status "Reincidente" - case-insensitive)
    const reincidentErrors = weekErrors.filter(e => {
      const status = (e.error_status || "").toLowerCase().trim()
      return status === "reincidente"
    }).length

    return {
      total,
      criticalPercent: total > 0 ? Math.round((critical / total) * 100) : 0,
      learnedPercent: total > 0 ? Math.round((learned / total) * 100) : 0,
      reincidentsPercent: total > 0 ? Math.round((reincidentErrors / total) * 100) : 0
    }
  }, [weekErrors])

  // ERROS POR DIA DA SEMANA
  const errorsByDay = useMemo(() => {
    const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
    const dayErrors: { [key: number]: number } = {}

    weekErrors.forEach(error => {
      const errorDate = new Date(error.created_at)
      const dayOfWeek = errorDate.getDay()
      const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Segunda = 0
      dayErrors[adjustedDay] = (dayErrors[adjustedDay] || 0) + 1
    })

    return days.map((day, index) => ({
      dia: day,
      quantidade: dayErrors[index] || 0
    }))
  }, [weekErrors])

  // ERROS POR MATÉRIA (Ranking)
  const errorsBySubject = useMemo(() => {
    const subjectCounts: { [key: string]: { count: number; id: string } } = {}

    weekErrors.forEach(error => {
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
  }, [weekErrors])

  // MATÉRIAS COM ERROS (para o grid)
  const subjectsWithErrors = useMemo(() => {
    const subjectIds = new Set(
      weekErrors.map(e => e.topics?.subjects?.id).filter(Boolean)
    )
    return subjects.filter(s => subjectIds.has(s.id))
  }, [subjects, weekErrors])

  return (
    <div className="space-y-6">
      {/* CARDS DE RESUMO */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          onClick={() => router.push("/week-summary")}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left transition hover:shadow-md hover:ring-2 hover:ring-slate-300 cursor-pointer"
        >
          <p className="text-sm text-slate-600">Total de Erros</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summaryCards.total}</p>
          <p className="mt-1 text-xs text-slate-500">Esta semana</p>
        </button>
        <button
          onClick={() => router.push("/week-summary?type=critical")}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left transition hover:shadow-md hover:ring-2 hover:ring-red-300 cursor-pointer"
        >
          <p className="text-sm text-slate-600">Erros Críticos</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{summaryCards.criticalPercent}%</p>
          <p className="mt-1 text-xs text-slate-500">Requim atenção</p>
        </button>
        <button
          onClick={() => router.push("/week-summary?type=reincident")}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left transition hover:shadow-md hover:ring-2 hover:ring-orange-300 cursor-pointer"
        >
          <p className="text-sm text-slate-600">Reincidentes</p>
          <p className="mt-1 text-2xl font-bold text-orange-600">{summaryCards.reincidentsPercent}%</p>
          <p className="mt-1 text-xs text-slate-500">Revisar urgente</p>
        </button>
        <button
          onClick={() => router.push("/week-summary?type=learned")}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-left transition hover:shadow-md hover:ring-2 hover:ring-green-300 cursor-pointer"
        >
          <p className="text-sm text-slate-600">Consolidados</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{summaryCards.learnedPercent}%</p>
          <p className="mt-1 text-xs text-slate-500">Progresso</p>
        </button>
      </div>

      {/* ERROS POR DIA DA SEMANA */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">
          Erros por Dia da Semana
        </h3>
        <div style={{ width: "100%", height: 300 }}>
          {errorsByDay.some(d => d.quantidade > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={errorsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="dia" 
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
              Nenhum erro registrado nesta semana
            </div>
          )}
        </div>
      </div>

      {/* RANKING POR MATÉRIA */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">
          Erros por Matéria (Prioridade de Estudo)
        </h3>
        <div style={{ width: "100%", height: Math.max(200, errorsBySubject.length * 50) }}>
          {errorsBySubject.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={errorsBySubject} 
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
              Nenhum erro registrado nesta semana
            </div>
          )}
        </div>
      </div>

      {/* GRID DE MATÉRIAS RECENTES */}
      {subjectsWithErrors.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-semibold text-slate-700">
            Matérias Recentes
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {subjectsWithErrors.map(subject => (
              <button
                key={subject.id}
                onClick={() => onSubjectClick(subject.id)}
                className="flex h-24 items-center justify-center rounded-xl bg-white text-slate-800 shadow-sm transition hover:shadow-md hover:ring-2 hover:ring-slate-300 ring-2 ring-orange-400"
              >
                <span className="text-base font-medium">
                  {subject.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* GRID DE TODAS AS MATÉRIAS */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-slate-700">
          Todas as Matérias
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {subjects.map(subject => (
            <button
              key={subject.id}
              onClick={() => onSubjectClick(subject.id)}
              className="flex h-24 items-center justify-center rounded-xl bg-white text-slate-800 shadow-sm transition hover:shadow-md hover:ring-2 hover:ring-slate-300"
            >
              <span className="text-base font-medium">
                {subject.name}
              </span>
            </button>
          ))}
          {subjects.length === 0 && (
            <div className="col-span-full py-8 text-center text-slate-500">
              Nenhuma matéria cadastrada
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
