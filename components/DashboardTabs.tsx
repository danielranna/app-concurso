"use client"

import { useState } from "react"
import { Calendar, TrendingUp, Clock, Lightbulb } from "lucide-react"

type TabId = "semana" | "tendencia" | "historico" | "analise"

type Props = {
  children: (activeTab: TabId) => React.ReactNode
}

export default function DashboardTabs({ children }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("semana")

  return (
    <div>
      {/* TAB BUTTONS */}
      <div className="mb-6 flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("semana")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition ${
            activeTab === "semana"
              ? "border-b-2 border-slate-900 text-slate-900"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <Calendar className="h-4 w-4" />
          Semana
        </button>
        <button
          onClick={() => setActiveTab("tendencia")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition ${
            activeTab === "tendencia"
              ? "border-b-2 border-slate-900 text-slate-900"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Tendência
        </button>
        <button
          onClick={() => setActiveTab("historico")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition ${
            activeTab === "historico"
              ? "border-b-2 border-slate-900 text-slate-900"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <Clock className="h-4 w-4" />
          Histórico
        </button>
        <button
          onClick={() => setActiveTab("analise")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition ${
            activeTab === "analise"
              ? "border-b-2 border-slate-900 text-slate-900"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <Lightbulb className="h-4 w-4" />
          Análise
        </button>
      </div>

      {/* TAB CONTENT */}
      <div>{children(activeTab)}</div>
    </div>
  )
}
