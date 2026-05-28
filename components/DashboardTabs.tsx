"use client"

import { useState } from "react"
import { Calendar, TrendingUp, Clock, Lightbulb } from "lucide-react"

type TabId = "semana" | "tendencia" | "historico" | "analise"

const tabs: { id: TabId; label: string; icon: typeof Calendar }[] = [
  { id: "semana", label: "Semana", icon: Calendar },
  { id: "tendencia", label: "Tendência", icon: TrendingUp },
  { id: "historico", label: "Histórico", icon: Clock },
  { id: "analise", label: "Análise", icon: Lightbulb },
]

type Props = {
  children: (activeTab: TabId) => React.ReactNode
}

export default function DashboardTabs({ children }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("semana")

  return (
    <div>
      <div className="-mx-4 mb-6 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max min-w-full gap-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-semibold transition sm:px-4 ${
                activeTab === id
                  ? "border-b-2 border-teal-600 text-teal-700"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>{children(activeTab)}</div>
    </div>
  )
}
