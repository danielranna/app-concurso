"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Check, Loader2, X } from "lucide-react"
import type { AiActionDraft } from "@/lib/coach-types"

export default function CoachInboxPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<AiActionDraft[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  function reload(uid: string) {
    fetch(`/api/coach/inbox?user_id=${uid}&status=pending`)
      .then((r) => r.json())
      .then(setDrafts)
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

  async function act(id: string, action: "approve" | "reject") {
    if (!userId) return
    setBusy(id)
    const res = await fetch(`/api/coach/inbox/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, action }),
    })
    const data = await res.json()
    setBusy(null)
    if (data.error) {
      alert(data.error)
      return
    }
    if (action === "approve" && data.result?.notebook_id) {
      router.push(`/questoes/cadernos/${data.result.notebook_id}`)
      return
    }
    reload(userId)
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        A IA só altera flashcards, erros ou cadernos depois que você aprovar cada
        item.
      </p>

      {!drafts.length ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Nenhuma ação pendente.
        </p>
      ) : (
        <ul className="space-y-3">
          {drafts.map((d) => (
            <li
              key={d.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {d.type}
                  </span>
                  <p className="mt-2 font-medium text-slate-900">{d.label}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {d.source_agent ?? "manual"} ·{" "}
                    {new Date(d.created_at).toLocaleString("pt-BR")}
                  </p>
                  <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                    {JSON.stringify(d.payload, null, 2)}
                  </pre>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => act(d.id, "approve")}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === d.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Aprovar
                  </button>
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => act(d.id, "reject")}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Descartar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
