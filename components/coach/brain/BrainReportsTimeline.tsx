"use client"

import Link from "next/link"
import type { BrainDetailPayload } from "@/lib/ai/brain-detail"

type Props = {
  reports: BrainDetailPayload["recent_reports"]
}

export default function BrainReportsTimeline({ reports }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
        Relatórios que alimentaram o cérebro
      </h2>
      {reports.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Nenhum relatório de caderno nesta matéria. Conclua um caderno para a IA
          analisar erros e atualizar o mapa.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {reports.map((r) => (
            <li
              key={r.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                r.is_last_report
                  ? "border-emerald-300 bg-emerald-50/50"
                  : "border-slate-100"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {r.headline ?? "Relatório de caderno"}
                </p>
                <p className="text-xs text-slate-500">
                  {r.notebook_name ?? "Caderno"} ·{" "}
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  {r.is_last_report && (
                    <span className="ml-1 font-medium text-emerald-700">
                      · usado na última atualização
                    </span>
                  )}
                </p>
              </div>
              <Link
                href={`/coach/relatorios/${r.id}`}
                className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
              >
                Abrir
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
