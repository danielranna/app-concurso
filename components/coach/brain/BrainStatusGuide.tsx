"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react"
import {
  BRAIN_STATUS_DESCRIPTIONS,
  BRAIN_STATUS_LABELS,
  OUTCOME_CATEGORY_DESCRIPTIONS,
  OUTCOME_CATEGORY_LABELS,
} from "@/lib/coach-labels"
import { brainStatusBadgeClass } from "./brain-status-styles"

const STATUS_ORDER = [
  "dominado",
  "forte",
  "instavel",
  "em_evolucao",
  "fraco",
  "critico",
  "ilusao_dominio",
] as const

const OUTCOME_ORDER = [
  "conhecimento_solido",
  "conhecimento_fragil",
  "lacuna_critica",
  "lacuna_consciente",
  "falso_positivo",
  "conteudo_desconhecido",
] as const

export default function BrainStatusGuide() {
  const [open, setOpen] = useState(true)

  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-5 w-5 text-blue-600" />
        ) : (
          <ChevronRight className="h-5 w-5 text-blue-600" />
        )}
        <HelpCircle className="h-4 w-4 text-blue-600" />
        <span className="font-semibold text-slate-900">
          Como definimos dominado, fraco, crítico e outros rótulos
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-blue-100 px-4 pb-4 pt-2">
          <p className="text-sm text-slate-600">
            <strong>Status do tópico</strong> (mapa por assunto) usa % de acertos e
            estabilidade entre tentativas. <strong>Outcome</strong> (lacuna crítica,
            conhecimento frágil, etc.) é por tentativa, a partir da sua confiança na hora
            de resolver.
          </p>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Status por assunto (cérebro)
            </h3>
            <ul className="space-y-2">
              {STATUS_ORDER.map((key) => (
                <li
                  key={key}
                  className="flex flex-wrap items-start gap-2 rounded-lg bg-white p-2 text-sm"
                >
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${brainStatusBadgeClass(key)}`}
                  >
                    {BRAIN_STATUS_LABELS[key]}
                  </span>
                  <span className="text-slate-600">
                    {BRAIN_STATUS_DESCRIPTIONS[key]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Rótulo por tentativa (confiança × resultado)
            </h3>
            <ul className="space-y-2">
              {OUTCOME_ORDER.map((key) => (
                <li
                  key={key}
                  className="rounded-lg bg-white p-2 text-sm text-slate-600"
                >
                  <span className="font-medium text-slate-800">
                    {OUTCOME_CATEGORY_LABELS[key]}:
                  </span>{" "}
                  {OUTCOME_CATEGORY_DESCRIPTIONS[key]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}
