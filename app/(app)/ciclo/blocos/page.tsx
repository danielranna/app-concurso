"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  ArrowLeft,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import type {
  StudyCycleContentBlock,
  StudyCycleContentBlockTopic,
  StudyCycleSubject,
} from "@/lib/study-cycle-types"

type TecTopic = { tec_subject: string; tec_topic: string }

const DRAG_TYPE = "application/x-tec-topic"

export default function CicloBlocosPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [cycleSubjects, setCycleSubjects] = useState<StudyCycleSubject[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<StudyCycleContentBlock[]>([])
  const [tecTopics, setTecTopics] = useState<TecTopic[]>([])
  const [cycleId, setCycleId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingTopics, setLoadingTopics] = useState(false)

  const loadBlocks = useCallback(async (uid: string, cid?: string | null) => {
    const q = cid ? `user_id=${uid}&cycle_id=${cid}` : `user_id=${uid}`
    const r = await fetch(`/api/ciclo/content-blocks?${q}`)
    const d = await r.json()
    if (d.cycle_id) setCycleId(d.cycle_id)
    setBlocks(d.blocks ?? [])
    return d.blocks ?? []
  }, [])

  const loadTopics = useCallback(async (uid: string, subjectId: string) => {
    setLoadingTopics(true)
    try {
      const r = await fetch(
        `/api/ciclo/content-blocks?user_id=${uid}&subject_id=${subjectId}&tec_topics=1`
      )
      const d = await r.json()
      setTecTopics(d.topics ?? [])
    } finally {
      setLoadingTopics(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      const ciclo = await fetch(`/api/ciclo?user_id=${user.id}`).then((r) =>
        r.json()
      )
      const subs: StudyCycleSubject[] = ciclo.cycle?.subjects ?? []
      setCycleSubjects(subs)
      setCycleId(ciclo.cycle?.id ?? null)
      if (subs.length) {
        setSelectedSubjectId(subs[0].subject_id)
        await loadBlocks(user.id, ciclo.cycle?.id)
        await loadTopics(user.id, subs[0].subject_id)
      }
      setLoading(false)
    })
  }, [router, loadBlocks, loadTopics])

  useEffect(() => {
    if (userId && selectedSubjectId) {
      loadTopics(userId, selectedSubjectId)
    }
  }, [userId, selectedSubjectId, loadTopics])

  const subjectBlocks = blocks.filter((b) => b.subject_id === selectedSubjectId)
  const assignedTopics = new Set(
    subjectBlocks.flatMap((b) =>
      b.topics.map((t) => `${t.tec_subject}\0${t.tec_topic}`)
    )
  )
  const availableTopics = tecTopics.filter(
    (t) => !assignedTopics.has(`${t.tec_subject}\0${t.tec_topic}`)
  )

  async function createBlock() {
    if (!userId || !selectedSubjectId) return
    const res = await fetch("/api/ciclo/content-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        action: "create_block",
        cycle_id: cycleId,
        subject_id: selectedSubjectId,
        name: `Bloco ${subjectBlocks.length + 1}`,
        sort_order: subjectBlocks.length,
      }),
    })
    const data = await res.json()
    if (data.error) alert(data.error)
    else {
      setCycleId(data.cycle_id)
      await loadBlocks(userId, data.cycle_id)
    }
  }

  async function addTopicToBlock(blockId: string, topic: TecTopic) {
    if (!userId) return
    const block = blocks.find((b) => b.id === blockId)
    const res = await fetch("/api/ciclo/content-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        action: "add_topic",
        block_id: blockId,
        tec_subject: topic.tec_subject,
        tec_topic: topic.tec_topic,
        sort_order: block?.topics.length ?? 0,
      }),
    })
    const data = await res.json()
    if (data.error) alert(data.error)
    else await loadBlocks(userId, cycleId)
  }

  async function removeTopic(topicId: string) {
    if (!userId) return
    await fetch(`/api/ciclo/content-blocks?topic_id=${topicId}`, {
      method: "DELETE",
    })
    await loadBlocks(userId, cycleId)
  }

  async function deleteBlock(blockId: string) {
    if (!userId || !confirm("Remover este bloco?")) return
    await fetch(`/api/ciclo/content-blocks?block_id=${blockId}`, {
      method: "DELETE",
    })
    await loadBlocks(userId, cycleId)
  }

  async function updateBlockName(blockId: string, name: string) {
    await fetch("/api/ciclo/content-blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ block_id: blockId, name }),
    })
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, name } : b))
    )
  }

  async function updateBlockMinutes(blockId: string, estimated_minutes: number) {
    await fetch("/api/ciclo/content-blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ block_id: blockId, estimated_minutes }),
    })
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, estimated_minutes } : b))
    )
  }

  function handleDrop(blockId: string, e: React.DragEvent) {
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    try {
      const topic = JSON.parse(raw) as TecTopic
      addTopicToBlock(blockId, topic)
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    )
  }

  if (!cycleSubjects.length) {
    return (
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <p className="text-slate-600">Selecione matérias primeiro.</p>
        <Link href="/ciclo/materias" className="text-teal-700 underline">
          Ir para Matérias
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        href="/ciclo/materias"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Blocos de estudo</h1>
        <p className="mt-1 text-sm text-slate-600">
          Arraste assuntos do banco para montar blocos em cada matéria.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Matérias */}
        <aside className="lg:col-span-2">
          <h2 className="mb-2 text-xs font-semibold uppercase text-slate-500">
            Matérias
          </h2>
          <ul className="space-y-1">
            {cycleSubjects.map((s) => {
              const count = blocks.filter((b) => b.subject_id === s.subject_id).length
              const active = selectedSubjectId === s.subject_id
              return (
                <li key={s.subject_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedSubjectId(s.subject_id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      active
                        ? "bg-teal-100 font-medium text-teal-900"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    {s.subject_name ?? s.subject_id}
                    <span className="ml-1 text-xs text-slate-400">({count})</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        {/* Assuntos disponíveis */}
        <section className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-4">
          <h2 className="mb-2 text-xs font-semibold uppercase text-slate-500">
            Assuntos do banco
          </h2>
          {loadingTopics ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
          ) : availableTopics.length === 0 ? (
            <p className="text-sm text-slate-500">
              {tecTopics.length === 0
                ? "Mapeie esta matéria ao banco TEC em Questões → Mapeamento."
                : "Todos os assuntos já estão em blocos."}
            </p>
          ) : (
            <ul className="max-h-[28rem] space-y-1 overflow-y-auto">
              {availableTopics.map((t) => (
                <li
                  key={`${t.tec_subject}:${t.tec_topic}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(t))
                  }}
                  className="flex cursor-grab items-center gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-sm active:cursor-grabbing"
                >
                  <GripVertical className="h-3 w-3 shrink-0 text-slate-400" />
                  <span className="truncate">{t.tec_topic || t.tec_subject}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Blocos */}
        <section className="space-y-3 lg:col-span-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase text-slate-500">
              Blocos —{" "}
              {cycleSubjects.find((s) => s.subject_id === selectedSubjectId)
                ?.subject_name ?? ""}
            </h2>
            <button
              type="button"
              onClick={createBlock}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
            >
              <Plus className="h-3 w-3" />
              Novo bloco
            </button>
          </div>

          {subjectBlocks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Crie um bloco e arraste assuntos para cá.
            </div>
          ) : (
            subjectBlocks.map((block) => (
              <BlockCard
                key={block.id}
                block={block}
                onDrop={(e) => handleDrop(block.id, e)}
                onRemoveTopic={removeTopic}
                onDelete={() => deleteBlock(block.id)}
                onRename={(name) => updateBlockName(block.id, name)}
                onMinutes={(m) => updateBlockMinutes(block.id, m)}
              />
            ))
          )}

          <Link
            href="/ciclo/planejar"
            className="inline-block text-sm text-teal-700 underline"
          >
            Próximo: planejar ciclo →
          </Link>
        </section>
      </div>
    </div>
  )
}

function BlockCard({
  block,
  onDrop,
  onRemoveTopic,
  onDelete,
  onRename,
  onMinutes,
}: {
  block: StudyCycleContentBlock
  onDrop: (e: React.DragEvent) => void
  onRemoveTopic: (id: string) => void
  onDelete: () => void
  onRename: (name: string) => void
  onMinutes: (m: number) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      className={`rounded-xl border-2 bg-white p-3 transition-colors ${
        dragOver ? "border-teal-400 bg-teal-50/30" : "border-slate-200"
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false)
        onDrop(e)
      }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={block.name}
          onChange={(e) => onRename(e.target.value)}
          className="flex-1 rounded border border-slate-200 px-2 py-1 text-sm font-medium"
        />
        <label className="flex items-center gap-1 text-xs text-slate-500">
          min
          <input
            type="number"
            min={15}
            step={15}
            value={block.estimated_minutes}
            onChange={(e) => onMinutes(Number(e.target.value))}
            className="w-14 rounded border border-slate-200 px-1 py-0.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={onDelete}
          className="text-red-500 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {block.topics.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">
          Solte assuntos aqui
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {block.topics.map((t: StudyCycleContentBlockTopic) => (
            <li
              key={t.id ?? `${t.tec_subject}:${t.tec_topic}`}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs"
            >
              {t.tec_topic || t.tec_subject}
              {t.id && (
                <button
                  type="button"
                  onClick={() => onRemoveTopic(t.id!)}
                  className="text-slate-400 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
