"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  ArrowLeft,
  Calendar,
  LayoutGrid,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react"

type PanelFilter = "due_today" | "overdue" | "all"

type SubjectRow = {
  id: string
  name: string
  deck_id: string
  card_count: number
  due_today: number
  overdue: number
}

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
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
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

export default function FlashcardsPanelPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialFilter = (searchParams.get("filter") as PanelFilter) || "due_today"
  const initialSubjectId = searchParams.get("subject_id")
  const initialOrphan = searchParams.get("orphan") === "1"

  const [userId, setUserId] = useState<string | null>(null)
  const [filter, setFilter] = useState<PanelFilter>(initialFilter)
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    initialOrphan ? null : initialSubjectId
  )
  const [viewOrphan, setViewOrphan] = useState(initialOrphan)
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [orphan, setOrphan] = useState<{ card_count: number; due_today: number; overdue: number } | null>(
    null
  )
  const [cards, setCards] = useState<PanelCard[]>([])
  const [totals, setTotals] = useState({ due_today: 0, overdue: 0, all: 0 })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [spreadDays, setSpreadDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editingCard, setEditingCard] = useState<PanelCard | null>(null)
  const [editDue, setEditDue] = useState("")

  const loadPanel = useCallback(async (uid: string) => {
    setLoading(true)
    const params = new URLSearchParams({ user_id: uid, filter })
    if (viewOrphan) params.set("orphan", "1")
    else if (selectedSubjectId) params.set("subject_id", selectedSubjectId)

    const res = await fetch(`/api/flashcards/panel?${params}`)
    const data = await res.json()
    setLoading(false)
    if (data.error) return

    setSubjects(data.subjects ?? [])
    setOrphan(data.orphan ?? null)
    setCards(data.cards ?? [])
    setTotals(data.totals ?? { due_today: 0, overdue: 0, all: 0 })
    setSelected(new Set())
  }, [filter, selectedSubjectId, viewOrphan])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      loadPanel(user.id)
    })
  }, [router, loadPanel])

  function updateUrl(subjectId: string | null, orphanView: boolean) {
    const params = new URLSearchParams()
    if (orphanView) params.set("orphan", "1")
    else if (subjectId) params.set("subject_id", subjectId)
    const q = params.toString()
    router.replace(q ? `/flashcards/panel?${q}` : "/flashcards/panel", { scroll: false })
  }

  function selectAll() {
    setViewOrphan(false)
    setSelectedSubjectId(null)
    updateUrl(null, false)
  }

  function selectSubject(subjectId: string) {
    setViewOrphan(false)
    setSelectedSubjectId(subjectId)
    updateUrl(subjectId, false)
  }

  function selectOrphan() {
    setViewOrphan(true)
    setSelectedSubjectId(null)
    updateUrl(null, true)
  }

  const activeSubject = subjects.find((s) => s.id === selectedSubjectId)

  const newCardHref = activeSubject
    ? `/flashcards/cards/new?deck_id=${activeSubject.deck_id}`
    : null

  const studyHref = (() => {
    const p = new URLSearchParams()
    if (activeSubject) p.set("subject_id", activeSubject.id)
    const q = p.toString()
    return q ? `/flashcards/study?${q}` : "/flashcards/study"
  })()

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllVisible() {
    if (selected.size === cards.length) setSelected(new Set())
    else setSelected(new Set(cards.map((c) => c.id)))
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

  async function deleteSelected() {
    if (!userId || selected.size === 0) return
    if (!confirm(`Excluir ${selected.size} card(s)?`)) return
    setBusy(true)
    await fetch("/api/flashcards/cards/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, card_ids: [...selected] }),
    })
    setBusy(false)
    loadPanel(userId)
  }

  if (!userId) return null

  const filterTabs: { key: PanelFilter; label: string; count: number }[] = [
    { key: "due_today", label: "Para hoje", count: totals.due_today },
    { key: "overdue", label: "Atrasados", count: totals.overdue },
    { key: "all", label: "Todos", count: totals.all },
  ]

  const contextLabel = viewOrphan
    ? "Cards sem matéria vinculada"
    : activeSubject
      ? activeSubject.name
      : null

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/flashcards" className="text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-slate-600" />
              <h1 className="text-lg font-semibold text-slate-800">Painel de flashcards</h1>
            </div>
            {contextLabel && (
              <p className="mt-1 text-sm font-medium text-emerald-800">{contextLabel}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {newCardHref ? (
            <Link
              href={newCardHref}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Novo card
            </Link>
          ) : (
            <span
              title="Selecione uma matéria"
              className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-400"
            >
              <Plus className="h-4 w-4" />
              Novo card
            </span>
          )}
          <Link
            href={studyHref}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
          >
            <Play className="h-4 w-4" />
            Estudar
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3">
          <button
            type="button"
            onClick={selectAll}
            className={`mb-2 w-full rounded-lg px-3 py-2 text-left text-sm ${
              !selectedSubjectId && !viewOrphan
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-200"
            }`}
          >
            Todas as matérias
          </button>

          {subjects.map((subject) => (
            <button
              key={subject.id}
              type="button"
              onClick={() => selectSubject(subject.id)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                selectedSubjectId === subject.id && !viewOrphan
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-200"
              }`}
            >
              <span className="truncate font-medium">{subject.name}</span>
              <span
                className={`ml-2 shrink-0 text-xs ${
                  selectedSubjectId === subject.id && !viewOrphan
                    ? "text-slate-300"
                    : "text-slate-400"
                }`}
              >
                {subject.card_count}
                {(subject.due_today > 0 || subject.overdue > 0) && (
                  <span className="ml-1 text-emerald-600">
                    · {subject.due_today + subject.overdue}
                  </span>
                )}
              </span>
            </button>
          ))}

          {orphan && orphan.card_count > 0 && (
            <button
              type="button"
              onClick={selectOrphan}
              className={`mt-3 w-full rounded-lg border border-dashed px-3 py-2 text-left text-sm ${
                viewOrphan
                  ? "border-amber-400 bg-amber-50 text-amber-900"
                  : "border-slate-300 text-slate-600 hover:bg-white"
              }`}
            >
              Sem matéria ({orphan.card_count})
            </button>
          )}

          <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
            Cada matéria do app é um baralho. Novas matérias em Erros aparecem aqui
            automaticamente.
          </p>
        </aside>

        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-white px-4 py-3">
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
              <label className="flex items-center gap-2 text-sm text-slate-700">
                Redistribuir em
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={spreadDays}
                  onChange={(e) => setSpreadDays(Number(e.target.value))}
                  className="w-16 rounded border border-slate-300 px-2 py-1 text-center"
                />
                dias
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={applySpread}
                className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm text-white hover:bg-amber-800 disabled:opacity-50"
              >
                Distribuir datas
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={deleteSelected}
                className="flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Excluir
              </button>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-xs text-slate-600 hover:underline"
            >
              {selected.size === cards.length && cards.length > 0
                ? "Desmarcar todos"
                : "Selecionar todos"}
            </button>
            <span className="text-xs text-slate-500">{cards.length} cards nesta lista</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2">
            {loading ? (
              <p className="py-8 text-center text-slate-500">Carregando...</p>
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
                        : "border-slate-100 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(card.id)}
                      onChange={() => toggleSelect(card.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">{card.preview}</p>
                      {card.subject_name && (
                        <p className="text-xs text-slate-500">{card.subject_name}</p>
                      )}
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
                        title="Editar card"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>

      {editingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="font-semibold text-slate-800">Alterar data de revisão</h3>
            <p className="mt-1 truncate text-sm text-slate-500">{editingCard.preview}</p>
            <input
              type="datetime-local"
              value={editDue}
              onChange={(e) => setEditDue(e.target.value)}
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCard(null)}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
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
