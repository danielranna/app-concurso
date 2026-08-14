"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Settings } from "lucide-react"
import { supabase } from "@/lib/supabase"
import FlashcardsBotSettings from "@/components/settings/FlashcardsBotSettings"
import CoachAiCredentialsModal from "@/components/coach/CoachAiCredentialsModal"
import MateriasHubManager from "@/components/materias/MateriasHubManager"
import ErrorTaxonomyPanel from "@/components/settings/ErrorTaxonomyPanel"

const TABS = [
  { id: "flashcards", label: "Flashcards" },
  { id: "integracoes", label: "Integrações" },
  { id: "api", label: "API IA" },
  { id: "materias", label: "Matérias" },
  { id: "assuntos", label: "Assuntos" },
  { id: "erros", label: "Erros" },
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

  return (
    <div className="px-4 py-8 sm:px-0">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Settings className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Configurações</h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
            Flashcards, WhatsApp, chave de IA, matérias, assuntos e tipos de erro — tudo em um
            lugar.
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "flashcards" && <FlashcardsBotSettings section="flashcards" />}
      {tab === "integracoes" && <FlashcardsBotSettings section="integracoes" />}
      {tab === "api" && <CoachAiCredentialsModal embedded open />}
      {tab === "materias" && <MateriasHubManager focus="subjects" />}
      {tab === "assuntos" && <MateriasHubManager focus="topics" />}
      {tab === "erros" && userId && <ErrorTaxonomyPanel userId={userId} />}
    </div>
  )
}
