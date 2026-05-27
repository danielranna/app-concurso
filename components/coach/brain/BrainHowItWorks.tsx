"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Info } from "lucide-react"

const STEPS = [
  {
    title: "1. Cada resposta vira um rótulo de metacognição",
    body: "Ao resolver, você indica confiança (seguro, inseguro, chute). O sistema combina isso com acerto/erro e grava outcome_category em cada tentativa.",
  },
  {
    title: "2. Agregação por assunto TEC",
    body: "As questões da matéria (via mapeamento TEC) são agrupadas por assunto/tópico. Contamos acertos, erros e tempos médios.",
  },
  {
    title: "3. Sinais de padrão",
    body: "Regras detectam reincidência de erro, consolidação, chutes rápidos, lentidão com insegurança e falsos positivos por tópico.",
  },
  {
    title: "4. Métricas do cérebro por tópico",
    body: "Domínio (% acertos), estabilidade (consistência entre tentativas) e retenção geram um status: dominado, forte, instável, fraco, crítico ou ilusão de domínio.",
  },
  {
    title: "5. Relatório de caderno (IA)",
    body: "Ao concluir um caderno, a IA classifica erros, descreve equívocos e mescla fraquezas no mapa do cérebro.",
  },
  {
    title: "6. Prioridades do Coach",
    body: "O ranking cruza edital, incidência histórica e urgência do cérebro para montar a fila estratégica e o plano de estudo.",
  },
]

export default function BrainHowItWorks() {
  const [open, setOpen] = useState(false)

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-5 w-5 text-slate-500" />
        ) : (
          <ChevronRight className="h-5 w-5 text-slate-500" />
        )}
        <Info className="h-4 w-4 text-blue-600" />
        <span className="font-semibold text-slate-900">Como o sistema me entende</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4">
          <p className="mb-4 text-sm text-slate-600">
            O cérebro <strong>não é um modelo treinado</strong> que aprende sozinho. É um
            estado calculado a partir das suas tentativas, reforçado por relatórios de
            caderno e narrativa opcional da IA.
          </p>
          <ol className="space-y-3">
            {STEPS.map((s) => (
              <li key={s.title} className="rounded-lg bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-900">{s.title}</p>
                <p className="mt-1 text-sm text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
