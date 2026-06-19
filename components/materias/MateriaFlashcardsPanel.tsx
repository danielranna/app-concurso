"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { Calendar, Pencil, Play, Plus, Trash2 } from "lucide-react"

type PanelFilter = "due_today" | "overdue" | "all"

type PanelCard = {
  id: string
  deck_id: string
  deck_name: string
  subject_name: string | null
  preview: string
  due_at: string | null
  is_overdue: boolean
  is_due_today: boolean
}

type Props = {
  subjectId: string
}

function formatDue(dateStr: string | null) {
  if (!dateStr) return "Sem data"
  const d = new Date(dateStr)
  const now = new Date()
  if (d < now) return `Atrasado · ${d.toLocaleString("pt-BR")}`
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return `Hoje · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
  }
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function toDatetimeLocal(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function MateriaFlashcardsPanel({ subjectId }: Props) {
  const [userId, setUserId] = useState<string | null>(null)
  const [filter, setFilter] = useState<PanelFilter>("due_today")
  const [deckId, setDeckId] = useState<string | null>(null)
  const [cards, setCards] = useState<PanelCard[]>([])
  const [totals, setTotals] = useState({ due_today: 0, overdue: 0, all: 0 })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [spreadDays, setSpreadDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editingCard, setEditingCard] = useState<PanelCard | null>(null)
  const [editDue, setEditDue] = useState("")

  const loadPanel = useCallback(
    async (uid: string) => {
      setLoading(true)
      const params = new URLSearchParams({ user_id: uid, filter, subject_id: subjectId })
      const res = await fetch(`/api/flashcards/panel?${params}`)
      const data = await res.json()
      setLoading(false)
      if (data.error) return
      const sub = (data.subjects ?? []).find((s: { id: string }) => s.id === subjectId)
      setDeckId(sub?.deck_id ?? null)
      setCards(data.cards ?? [])
      setTotals(data.totals ?? { due_today: 0, overdue: 0, all: 0 })
      setSelected(new Set())
    },
    [filter, subjectId]
  )

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      loadPanel(user.id)
    })
  }, [loadPanel])

  const studyHref = `/flashcards/study?subject_id=${subjectId}`
  const newCardHref = deckId ? `/flashcards/cards/new?deck_id=${deckId}` : null

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function applySpread() {
    if (!userId || selected.size === 0) return
    setBusy(true)
    await fetch("/api/flashcards/states/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        card_ids: [...selected],
        mode: "spread",
        spread_days: spreadDays,
      }),
    })
    setBusy(false)
    loadPanel(userId)
  }

  async function saveCardDue() {
    if (!userId || !editingCard || !editDue) return
    setBusy(true)
    await fetch("/api/flashcards/states/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        card_ids: [editingCard.id],
        mode: "set",
        due_at: new Date(editDue).toISOString(),
      }),
    })
    setBusy(false)
    setEditingCard(null)
    loadPanel(userId)
  }

  const filterTabs: { key: PanelFilter; label: string; count: number }[] = [
    { key: "due_today", label: "Para hoje", count: totals.due_today },
    { key: "overdue", label: "Atrasados", count: totals.overdue },
    { key: "all", label: "Todos", count: totals.all },
  ]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Flashcards desta matéria.</p>
        <div className="flex flex-wrap gap-2">
          {newCardHref ? (
            <Link
              href={newCardHref}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Novo card
            </Link>
          ) : null}
          <Link
            href={studyHref}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
          >
            <Play className="h-4 w-4" />
            Estudar
          </Link>
          <Link
            href={`/flashcards/panel?subject_id=${subjectId}`}
            className="rounded-lg border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Abrir painel completo
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                filter === tab.key
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {tab.label}
              <span className="ml-1 opacity-70">({tab.count})</span>
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-amber-100 bg-amber-50 px-4 py-3">
            <span className="text-sm font-medium text-amber-900">
              {selected.size} selecionado{selected.size > 1 ? "s" : ""}
            </span>
            <label className="flex items-center gap-2 text-sm">
              Redistribuir em
              <input
                type="number"
                min={0}
                max={365}
                value={spreadDays}
                onChange={(e) => setSpreadDays(Number(e.target.value))}
                className="w-16 rounded border px-2 py-1 text-center"
              />
              dias
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={applySpread}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Distribuir datas
            </button>
          </div>
        )}

        <div className="max-h-[32rem] overflow-y-auto px-4 py-2">
          {loading ? (
            <p className="py-8 text-center text-slate-500">Carregando…</p>
          ) : cards.length === 0 ? (
            <p className="py-8 text-center text-slate-500">Nenhum card neste filtro.</p>
          ) : (
            <ul className="space-y-1">
              {cards.map((card) => (
                <li
                  key={card.id}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 ${
                    selected.has(card.id)
                      ? "border-amber-300 bg-amber-50/50"
                      : "border-slate-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(card.id)}
                    onChange={() => toggleSelect(card.id)}
                    className="h-4 w-4 rounded"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800">{card.preview}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      card.is_overdue
                        ? "text-amber-700"
                        : card.is_due_today
                          ? "text-emerald-700"
                          : "text-slate-500"
                    }`}
                  >
                    {formatDue(card.due_at)}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      title="Alterar data"
                      onClick={() => {
                        setEditingCard(card)
                        setEditDue(toDatetimeLocal(card.due_at))
                      }}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                    >
                      <Calendar className="h-4 w-4" />
                    </button>
                    <Link
                      href={`/flashcards/cards/${card.id}/edit`}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-slate-800">Alterar data de revisão</h3>
            <input
              type="datetime-local"
              value={editDue}
              onChange={(e) => setEditDue(e.target.value)}
              className="mt-4 w-full rounded-lg border px-3 py-2"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || !editDue}
                onClick={saveCardDue}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
