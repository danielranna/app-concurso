"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { FolderOpen, Filter, Calendar, Link2, Inbox } from "lucide-react"

type SubjectRow = {
  id: string
  name: string
  notebook_count: number
  total_questions: number
  correct: number
  wrong: number
}

type Unassigned = {
  notebook_count: number
  notebooks: { id: string; name: string; question_count: number }[]
}

type Ephemeral = {
  notebook_count: number
  notebooks: { id: string; name: string; question_count: number }[]
}

export default function QuestoesHomePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [bankTotal, setBankTotal] = useState(0)
  const [unassigned, setUnassigned] = useState<Unassigned | null>(null)
  const [ephemeral, setEphemeral] = useState<Ephemeral | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      fetch(`/api/questions/panel?user_id=${user.id}`)
        .then((r) => r.json())
        .then((d) => {
          setSubjects(d.subjects ?? [])
          setBankTotal(d.bank_total ?? 0)
          setUnassigned(d.unassigned ?? null)
          setEphemeral(d.ephemeral ?? null)
        })
    })
  }, [router])

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Questões</h1>
          <p className="text-sm text-slate-500">
            Banco global: {bankTotal.toLocaleString("pt-BR")} questões
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/questoes/banco"
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            <Filter className="h-4 w-4" /> Banco e filtros
          </Link>
          <Link
            href="/questoes/importar"
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
          >
            Importar PDF
          </Link>
          <Link
            href="/questoes/semana"
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            <Calendar className="h-4 w-4" /> Semana / estudo combinado
          </Link>
          <Link
            href="/questoes/mapeamento"
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            <Link2 className="h-4 w-4" /> Associar matérias e assuntos
          </Link>
        </div>
      </div>
      {(ephemeral?.notebook_count ?? 0) > 0 && (
        <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="font-semibold text-violet-900">Cadernos do plano (não salvos)</p>
          <p className="mt-1 text-sm text-violet-800">
            Gerados pelo Coach — salve na biblioteca para organizar por matéria.
          </p>
          <ul className="mt-3 space-y-2">
            {ephemeral!.notebooks.map((nb) => (
              <li key={nb.id}>
                <Link
                  href={`/questoes/cadernos/${nb.id}`}
                  className="text-sm font-medium text-violet-700 underline hover:text-violet-900"
                >
                  {nb.name} ({nb.question_count} questões)
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(unassigned?.notebook_count ?? 0) > 0 && (
        <Link
          href="/questoes/importados"
          className="mb-6 flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300"
        >
          <Inbox className="h-8 w-8 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-900">Importados (sem matéria sua)</p>
            <p className="text-sm text-amber-800">
              {unassigned!.notebook_count} caderno(s) — vincule quando quiser
            </p>
          </div>
        </Link>
      )}
      <div className="space-y-3">
        {subjects.map((s) => {
          const total = s.correct + s.wrong
          const pctCorrect = total > 0 ? (s.correct / total) * 100 : 0
          const pctWrong = total > 0 ? (s.wrong / total) * 100 : 0
          return (
            <Link
              key={s.id}
              href={`/questoes/materia/${s.id}`}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
            >
              <FolderOpen className="h-8 w-8 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-blue-700">{s.name}</p>
                <p className="text-sm text-slate-500">
                  {s.notebook_count} cadernos · {s.total_questions} questões
                </p>
              </div>
              {total > 0 && (
                <div className="hidden w-48 sm:block">
                  <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="bg-green-500" style={{ width: `${pctCorrect}%` }} />
                    <div className="bg-red-500" style={{ width: `${pctWrong}%` }} />
                  </div>
                </div>
              )}
            </Link>
          )
        })}
        {subjects.length === 0 && (
          <p className="text-slate-500">
            Crie matérias em{" "}
            <Link href="/erros" className="text-blue-600 underline">
              Mapa de erros
            </Link>{" "}
            para organizar cadernos.
          </p>
        )}
      </div>
    </div>
  )
}
