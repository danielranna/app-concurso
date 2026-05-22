"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Star } from "lucide-react"
import type { ExamTarget } from "@/lib/coach-types"

export default function CoachEditaisPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [targets, setTargets] = useState<ExamTarget[]>([])
  const [name, setName] = useState("")
  const [banca, setBanca] = useState("")
  const [saving, setSaving] = useState(false)

  function reload(uid: string) {
    fetch(`/api/coach/exam-targets?user_id=${uid}`)
      .then((r) => r.json())
      .then(setTargets)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      reload(user.id)
    })
  }, [router])

  async function createTarget() {
    if (!userId || !name.trim()) return
    setSaving(true)
    await fetch("/api/coach/exam-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        name: name.trim(),
        banca: banca.trim() || null,
        set_active: targets.length === 0,
      }),
    })
    setName("")
    setBanca("")
    setSaving(false)
    reload(userId)
  }

  async function setActive(id: string) {
    if (!userId) return
    await fetch(`/api/coach/exam-targets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, set_active: true }),
    })
    reload(userId)
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Cadastre a prova alvo. Em breve: upload do PDF do edital e PDF de
        incidência por matéria para o coach cruzar com seu desempenho.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Nova prova alvo
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex. TRT 2026)"
            className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={banca}
            onChange={(e) => setBanca(e.target.value)}
            placeholder="Banca (opcional)"
            className="min-w-[140px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={createTarget}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Adicionar
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {targets.map((t) => (
          <li
            key={t.id}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
              t.is_active
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <div>
              <p className="font-medium text-slate-900">{t.name}</p>
              {t.banca && (
                <p className="text-xs text-slate-500">{t.banca}</p>
              )}
            </div>
            {t.is_active ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800">
                <Star className="h-3 w-3 fill-current" />
                Ativa
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setActive(t.id)}
                className="text-xs font-medium text-violet-700 hover:underline"
              >
                Definir como ativa
              </button>
            )}
          </li>
        ))}
        {!targets.length && (
          <li className="text-center text-sm text-slate-500 py-6">
            Nenhuma prova cadastrada.
          </li>
        )}
      </ul>

      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        <strong>Próximo passo:</strong> upload de PDF do edital (pesos) e PDF de
        incidência por matéria. O agente <code>coach_edital</code> usará esses
        documentos junto com seus relatórios e tentativas.
      </div>
    </div>
  )
}
