"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  BookOpen,
  Flag,
  FolderTree,
  KeyRound,
  Layers,
  Link2,
  Radio,
  Settings,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import FlashcardsBotSettings from "@/components/settings/FlashcardsBotSettings"
import CoachAiCredentialsModal from "@/components/coach/CoachAiCredentialsModal"
import MateriasHubManager from "@/components/materias/MateriasHubManager"
import ErrorTaxonomyPanel from "@/components/settings/ErrorTaxonomyPanel"
import QuizSyncWebhooksPanel from "@/components/settings/QuizSyncWebhooksPanel"

const TABS = [
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "integracoes", label: "Integrações", icon: Link2 },
  { id: "api", label: "API IA", icon: KeyRound },
  { id: "materias", label: "Matérias", icon: BookOpen },
  { id: "assuntos", label: "Assuntos", icon: FolderTree },
  { id: "erros", label: "Erros", icon: Flag },
  { id: "webhooks", label: "Webhooks", icon: Radio },
] as const

type TabId = (typeof TABS)[number]["id"]

function isTab(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value)
}

export default function ConfiguracoesPage() {
  return (
    <Suspense fallback={<div className="px-4 py-8 text-sm text-slate-500">Carregando…</div>}>
      <ConfiguracoesHub />
    </Suspense>
  )
}

function ConfiguracoesHub() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requested = searchParams.get("tab")
  const tab: TabId = isTab(requested) ? requested : "flashcards"
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
    })
  }, [router])

  function setTab(next: TabId) {
    router.replace(`/configuracoes?tab=${next}`)
  }

  const active = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-5 py-6 text-white shadow-sm sm:px-7">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-300">
              Flashcards, WhatsApp, chave de IA, matérias e tipos de erro — um só lugar.
            </p>
          </div>
        </div>
      </header>

      <nav
        className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
        aria-label="Seções"
      >
        {TABS.map((t) => {
          const Icon = t.icon
          const on = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                on
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </nav>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="mb-5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {active.label}
        </p>
        {tab === "flashcards" && <FlashcardsBotSettings section="flashcards" />}
        {tab === "integracoes" && <FlashcardsBotSettings section="integracoes" />}
        {tab === "api" && <CoachAiCredentialsModal embedded open />}
        {tab === "materias" && <MateriasHubManager focus="subjects" />}
        {tab === "assuntos" && <MateriasHubManager focus="topics" />}
        {tab === "erros" && userId && <ErrorTaxonomyPanel userId={userId} />}
        {tab === "webhooks" && userId && <QuizSyncWebhooksPanel userId={userId} />}
      </div>
    </div>
  )
}
