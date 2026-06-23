"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  FolderOpen,
  Filter,
  Calendar,
  Link2,
  Inbox,
  FileText,
  ClipboardList,
  Upload,
  Sparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  QuestoesActionCard,
  QuestoesAlertBanner,
  QuestoesEmptyState,
} from "@/components/questions/questoes-shell"
import PerformanceStackBar from "@/components/questions/PerformanceStackBar"
import { cn } from "@/lib/utils"

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
    <div className="space-y-8">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Questões</h1>
          <Badge variant="outline" className="tabular-nums">
            {bankTotal.toLocaleString("pt-BR")} no banco
          </Badge>
        </div>
        <p className="max-w-xl text-sm text-slate-500">
          Importe, filtre e resolva questões. Organize cadernos por matéria e acompanhe seu
          desempenho.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QuestoesActionCard
          href="/questoes/importar"
          icon={Upload}
          title="Importar PDF"
          description="Wizard com revisão antes de salvar"
          variant="primary"
        />
        <QuestoesActionCard
          href="/questoes/banco"
          icon={Filter}
          title="Banco e filtros"
          description="Banca, órgão, matéria TEC e assuntos"
        />
        <QuestoesActionCard
          href="/questoes/semana"
          icon={Calendar}
          title="Semana / estudo combinado"
          description="Import em lote e sessões mistas"
        />
        <QuestoesActionCard
          href="/questoes/revisao"
          icon={ClipboardList}
          title="Correções do dia"
          description="Erros do dia com gabarito"
          variant="danger"
        />
        <QuestoesActionCard
          href="/questoes/mapeamento"
          icon={Link2}
          title="Associar matérias"
          description="Vincule TEC às suas matérias"
        />
        <QuestoesActionCard
          href="/questoes/conteudos"
          icon={FileText}
          title="Conteúdos compartilhados"
          description="Textos e imagens reutilizáveis"
        />
      </div>

      {(ephemeral?.notebook_count ?? 0) > 0 && (
        <QuestoesAlertBanner
          variant="violet"
          icon={Sparkles}
          title="Cadernos do plano (não salvos)"
          description="Gerados pelo Coach — salve na biblioteca para organizar por matéria."
        >
          <ul className="mt-3 space-y-1.5">
            {ephemeral!.notebooks.map((nb) => (
              <li key={nb.id}>
                <Link
                  href={`/questoes/cadernos/${nb.id}`}
                  className="text-sm font-medium text-violet-700 hover:text-violet-900 hover:underline"
                >
                  {nb.name}{" "}
                  <span className="font-normal text-violet-600">
                    ({nb.question_count} questões)
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </QuestoesAlertBanner>
      )}

      {(unassigned?.notebook_count ?? 0) > 0 && (
        <QuestoesAlertBanner
          variant="amber"
          icon={Inbox}
          title="Importados (sem matéria sua)"
          description={`${unassigned!.notebook_count} caderno(s) — vincule quando quiser`}
          href="/questoes/importados"
        />
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">Suas matérias</h2>
          {subjects.length > 0 && (
            <span className="text-xs text-slate-400">{subjects.length} matéria(s)</span>
          )}
        </div>

        {subjects.length === 0 ? (
          <QuestoesEmptyState
            title="Nenhuma matéria ainda"
            description="Crie matérias no Mapa de erros para organizar seus cadernos."
            action={
              <Button variant="secondary" asChild>
                <Link href="/erros">Ir para Mapa de erros</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {subjects.map((s) => {
              const total = s.correct + s.wrong
              return (
                <Link key={s.id} href={`/questoes/materia/${s.id}`} className="block group">
                  <Card
                    className={cn(
                      "transition-all hover:border-slate-300/80 hover:shadow-md hover:shadow-slate-200/50"
                    )}
                  >
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition-colors group-hover:bg-teal-50 group-hover:text-teal-600">
                        <FolderOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900 group-hover:text-teal-700">
                          {s.name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {s.notebook_count} cadernos · {s.total_questions} questões
                        </p>
                      </div>
                      {total > 0 && (
                        <div className="hidden w-44 sm:block">
                          <PerformanceStackBar
                            correct={s.correct}
                            wrong={s.wrong}
                            showText={false}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
