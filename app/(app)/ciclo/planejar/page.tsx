"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  ArrowLeft,
  Loader2,
  Plus,
  Save,
  Play,
  Trash2,
} from "lucide-react"
import type { StudyCycleBlock, StudyCycleBlockType } from "@/lib/study-cycle-types"
import type { SubjectContentNode } from "@/lib/content-index-types"

type Subject = { id: string; name: string }

type DayDraft = {
  day_index: number
  weekday: number | null
  blocks: StudyCycleBlock[]
}

const BLOCK_TYPES: { value: StudyCycleBlockType; label: string }[] = [
  { value: "questions", label: "Questões" },
  { value: "flashcards", label: "Flashcards" },
  { value: "read", label: "Leitura" },
  { value: "error_review", label: "Revisão de erros" },
]

function emptyBlock(dayIndex: number, sortOrder: number): StudyCycleBlock {
  return {
    day_index: dayIndex,
    subject_id: "",
    content_node_id: null,
    block_type: "questions",
    sort_order: sortOrder,
    label: "",
    params: { question_count: 20, minutes: 30 },
  }
}

export default function CicloPlanejarPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [days, setDays] = useState<DayDraft[]>([{ day_index: 0, weekday: null, blocks: [] }])
  const [contentBySubject, setContentBySubject] = useState<
    Record<string, SubjectContentNode[]>
  >({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadContentNodes = useCallback(async (uid: string, sid: string) => {
    const r = await fetch(`/api/ciclo/content?user_id=${uid}&subject_id=${sid}`)
    const d = await r.json()
    const flat: SubjectContentNode[] = []
    function walk(nodes: SubjectContentNode[]) {
      for (const n of nodes) {
        flat.push(n)
        if (n.children) walk(n.children)
      }
    }
    walk(d.nodes ?? [])
    for (const u of d.ungrouped ?? []) flat.push(u)
    return flat
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      const [subList, ciclo] = await Promise.all([
        fetch(`/api/subjects?user_id=${user.id}`).then((r) => r.json()),
        fetch(`/api/ciclo?user_id=${user.id}`).then((r) => r.json()),
      ])
      const subs: Subject[] = Array.isArray(subList) ? subList : []
      setSubjects(subs)

      if (ciclo.cycle?.days?.length) {
        setDays(
          ciclo.cycle.days.map(
            (d: { day_index: number; weekday: number | null; blocks: StudyCycleBlock[] }) => ({
              day_index: d.day_index,
              weekday: d.weekday,
              blocks: d.blocks?.length ? d.blocks : [],
            })
          )
        )
      }

      const map: Record<string, SubjectContentNode[]> = {}
      for (const s of subs) {
        map[s.id] = await loadContentNodes(user.id, s.id)
      }
      setContentBySubject(map)
      setLoading(false)
    })
  }, [router, loadContentNodes])

  function addDay() {
    setDays((prev) => [
      ...prev,
      { day_index: prev.length, weekday: null, blocks: [] },
    ])
  }

  function removeDay(idx: number) {
    setDays((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((d, i) => ({ ...d, day_index: i }))
    )
  }

  function addBlock(dayIdx: number) {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIdx
          ? {
              ...d,
              blocks: [...d.blocks, emptyBlock(d.day_index, d.blocks.length)],
            }
          : d
      )
    )
  }

  function updateBlock(
    dayIdx: number,
    blockIdx: number,
    patch: Partial<StudyCycleBlock>
  ) {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIdx
          ? {
              ...d,
              blocks: d.blocks.map((b, j) =>
                j === blockIdx ? { ...b, ...patch } : b
              ),
            }
          : d
      )
    )
  }

  function removeBlock(dayIdx: number, blockIdx: number) {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIdx
          ? {
              ...d,
              blocks: d.blocks.filter((_, j) => j !== blockIdx),
            }
          : d
      )
    )
  }

  async function save(activate: boolean) {
    if (!userId) return
    const hasBlocks = days.some((d) => d.blocks.length > 0)
    if (!hasBlocks) {
      alert("Adicione ao menos um bloco em algum dia")
      return
    }
    for (const d of days) {
      for (const b of d.blocks) {
        if (!b.subject_id) {
          alert("Selecione a matéria em todos os blocos")
          return
        }
      }
    }

    setSaving(true)
    try {
      const res = await fetch("/api/ciclo/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: activate ? "save_and_activate" : "save",
          name: "Meu ciclo",
          days: days.map((d) => ({
            day_index: d.day_index,
            weekday: d.weekday,
            blocks: d.blocks.map((b, sort_order) => ({
              ...b,
              sort_order,
              label:
                b.label ||
                contentBySubject[b.subject_id]?.find(
                  (n) => n.id === b.content_node_id
                )?.name ||
                "",
            })),
          })),
        }),
      })
      const data = await res.json()
      if (data.error) alert(data.error)
      else router.push("/ciclo")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/ciclo"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Planejar ciclo</h1>
        <p className="mt-1 text-sm text-slate-600">
          Monte cada dia manualmente: matérias e blocos de conteúdo. Organize o
          índice em{" "}
          <Link href="/ciclo/conteudo" className="text-teal-700 underline">
            Conteúdo
          </Link>{" "}
          antes.
        </p>
      </div>

      {days.map((day, dayIdx) => (
        <section
          key={day.day_index}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Dia {day.day_index + 1}</h2>
            {days.length > 1 && (
              <button
                type="button"
                onClick={() => removeDay(dayIdx)}
                className="text-sm text-red-600 hover:underline"
              >
                Remover dia
              </button>
            )}
          </div>

          <div className="mt-3 space-y-3">
            {day.blocks.map((block, blockIdx) => (
              <div
                key={blockIdx}
                className="rounded-lg border border-slate-100 bg-slate-50/50 p-3"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-600">
                    Matéria
                    <select
                      value={block.subject_id}
                      onChange={(e) =>
                        updateBlock(dayIdx, blockIdx, {
                          subject_id: e.target.value,
                          content_node_id: null,
                        })
                      }
                      className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                    >
                      <option value="">Selecione</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Tópico / grupo
                    <select
                      value={block.content_node_id ?? ""}
                      disabled={!block.subject_id}
                      onChange={(e) =>
                        updateBlock(dayIdx, blockIdx, {
                          content_node_id: e.target.value || null,
                        })
                      }
                      className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm disabled:opacity-50"
                    >
                      <option value="">Geral da matéria</option>
                      {(contentBySubject[block.subject_id] ?? []).map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Tipo
                    <select
                      value={block.block_type}
                      onChange={(e) =>
                        updateBlock(dayIdx, blockIdx, {
                          block_type: e.target.value as StudyCycleBlockType,
                        })
                      }
                      className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                    >
                      {BLOCK_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Questões / meta
                    <input
                      type="number"
                      min={1}
                      value={block.params.question_count ?? 20}
                      onChange={(e) =>
                        updateBlock(dayIdx, blockIdx, {
                          params: {
                            ...block.params,
                            question_count: Number(e.target.value),
                          },
                        })
                      }
                      className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600 sm:col-span-2">
                    Rótulo (opcional)
                    <input
                      type="text"
                      value={block.label}
                      onChange={(e) =>
                        updateBlock(dayIdx, blockIdx, { label: e.target.value })
                      }
                      className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => removeBlock(dayIdx, blockIdx)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                  Remover bloco
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => addBlock(dayIdx)}
            className="mt-3 inline-flex items-center gap-1 text-sm text-teal-700 hover:underline"
          >
            <Plus className="h-4 w-4" />
            Adicionar bloco
          </button>
        </section>
      ))}

      <button
        type="button"
        onClick={addDay}
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        <Plus className="h-4 w-4" />
        Adicionar dia
      </button>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => save(false)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar rascunho
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => save(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Salvar e ativar
        </button>
      </div>
    </div>
  )
}
