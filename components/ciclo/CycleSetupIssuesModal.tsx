"use client"

import Link from "next/link"
import { AlertTriangle, X } from "lucide-react"
import {
  groupSetupIssuesBySubject,
  type CycleSetupIssue,
} from "@/lib/study-cycle-setup-validation"

type Props = {
  issues: CycleSetupIssue[]
  onClose: () => void
  title?: string
  subtitle?: string
}

export default function CycleSetupIssuesModal({
  issues,
  onClose,
  title = "Pendências antes de gerar",
  subtitle = "Corrija os itens abaixo em Blocos e tente gerar de novo.",
}: Props) {
  const grouped = groupSetupIssuesBySubject(issues)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border bg-white shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {[...grouped.entries()].map(([subjectId, { subject_name, issues: list }]) => (
            <li key={subjectId} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{subject_name}</p>
                <Link
                  href={`/ciclo/blocos?subject_id=${encodeURIComponent(subjectId)}`}
                  className="text-xs font-medium text-teal-700 underline hover:text-teal-900"
                  onClick={onClose}
                >
                  Abrir em Blocos →
                </Link>
              </div>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                {list.map((issue) => (
                  <li key={issueKey(issue)} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span>{issueLabel(issue)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Fechar
          </button>
          <Link
            href="/ciclo/blocos"
            onClick={onClose}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Ir para Blocos
          </Link>
        </div>
      </div>
    </div>
  )
}

function issueKey(issue: CycleSetupIssue): string {
  if (issue.kind === "subject_no_blocks") return `sub:${issue.subject_id}`
  return `block:${issue.block_id}`
}

function issueLabel(issue: CycleSetupIssue): string {
  if (issue.kind === "subject_no_blocks") {
    return "Nenhum bloco criado — adicione ao menos um bloco nesta matéria."
  }
  return `Bloco "${issue.block_name}": adicione assuntos do banco ou escreva o que vai estudar (nota manual).`
}
