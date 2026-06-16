"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  ArrowLeft,
  BookOpen,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react"
import type {
  StudyCycleContentBlock,
  StudyCycleSubject,
} from "@/lib/study-cycle-types"
import type { TecSubjectTreeResponse } from "@/lib/tec-subject-tree-types"
import { topicKey, type TecTopicRef } from "@/lib/study-cycle-topic-utils"
import TecTopicTree, {
  DRAG_TYPE,
  dragPayloadToTopics,
  parseDragPayload,
} from "@/components/ciclo/TecTopicTree"
import BlockTopicGroups from "@/components/ciclo/BlockTopicGroups"
import NotebookPickerModal from "@/components/ciclo/NotebookPickerModal"

export default function CicloBlocosPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [userId, setUserId] = useState<string | null>(null)
  const [cycleSubjects, setCycleSubjects] = useState<StudyCycleSubject[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<StudyCycleContentBlock[]>([])
  const [trees, setTrees] = useState<TecSubjectTreeResponse[]>([])
  const [flatTopics, setFlatTopics] = useState<TecTopicRef[]>([])
  const [cycleId, setCycleId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadBlocks = useCallback(async (uid: string, cid?: string | null) => {
    const q = cid ? `user_id=${uid}&cycle_id=${cid}` : `user_id=${uid}`
    const r = await fetch(`/api/ciclo/content-blocks?${q}`)
    const d = await r.json()
    if (d.cycle_id) setCycleId(d.cycle_id)
    setBlocks(d.blocks ?? [])
    return d.blocks ?? []
  }, [])

  const loadTopicTree = useCallback(async (uid: string, subjectId: string) => {
    setLoadingTopics(true)
    try {
      const r = await fetch(
        `/api/ciclo/content-blocks?user_id=${uid}&subject_id=${subjectId}&tec_tree=1`
      )
      const d = await r.json()
      setTrees(d.trees ?? [])
      setFlatTopics(d.flat_topics ?? [])
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
        const fromQuery = searchParams.get("subject_id")
        const initial =
          fromQuery && subs.some((s) => s.subject_id === fromQuery)
            ? fromQuery
            : subs[0].subject_id
        setSelectedSubjectId(initial)
        await loadBlocks(user.id, ciclo.cycle?.id)
        await loadTopicTree(user.id, initial)
      }
      setLoading(false)
    })
  }, [router, loadBlocks, loadTopicTree, searchParams])

  useEffect(() => {
    if (userId && selectedSubjectId) {
      loadTopicTree(userId, selectedSubjectId)
    }
  }, [userId, selectedSubjectId, loadTopicTree])

  const subjectBlocks = blocks.filter((b) => b.subject_id === selectedSubjectId)

  const assignedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const b of subjectBlocks) {
      for (const t of b.topics) {
        keys.add(topicKey({ tec_subject: t.tec_subject, tec_topic: t.tec_topic }))
      }
    }
    return keys
  }, [subjectBlocks])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

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

  async function addTopicsToBlock(
    blockId: string,
    topics: TecTopicRef[],
    blockName?: string
  ) {
    if (!userId || !topics.length) return
    const block = blocks.find((b) => b.id === blockId)
    const res = await fetch("/api/ciclo/content-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        action: "add_topics",
        block_id: blockId,
        topics,
        sort_order: block?.topics.length ?? 0,
      }),
    })
    const data = await res.json()
    if (data.error) alert(data.error)
    else {
      const n = data.added ?? topics.length
      showToast(
        n === 1
          ? `1 assunto adicionado${blockName ? ` em ${blockName}` : ""}`
          : `${n} assuntos adicionados${blockName ? ` em ${blockName}` : ""}`
      )
      await loadBlocks(userId, cycleId)
    }
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

  async function updateBlockNotebook(
    blockId: string,
    notebook: { id: string; name: string } | null
  ) {
    await fetch("/api/ciclo/content-blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        block_id: blockId,
        notebook_id: notebook?.id ?? null,
      }),
    })
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              notebook_id: notebook?.id ?? null,
              notebook_name: notebook?.name ?? null,
            }
          : b
      )
    )
  }

  async function updateBlockStudyNote(blockId: string, study_note: string) {
    await fetch("/api/ciclo/content-blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ block_id: blockId, study_note: study_note || null }),
    })
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, study_note: study_note || null } : b))
    )
  }

  function handleDrop(blockId: string, blockName: string, e: React.DragEvent) {
    e.preventDefault()
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    const payload = parseDragPayload(raw)
    if (!payload) return
    const topics = dragPayloadToTopics(payload).filter(
      (t) => !assignedKeys.has(topicKey(t))
    )
    if (topics.length) addTopicsToBlock(blockId, topics, blockName)
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

  const selectedName =
    cycleSubjects.find((s) => s.subject_id === selectedSubjectId)?.subject_name ?? ""

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
          Arraste assuntos ou pastas inteiras do banco para montar blocos.
        </p>
      </div>

      {toast && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
          {toast}
        </div>
      )}

      <div className="grid h-[min(70vh,calc(100vh-11rem))] min-h-[24rem] gap-4 lg:grid-cols-12">
        {/* Matérias */}
        <aside className="flex min-h-0 flex-col lg:col-span-2">
          <h2 className="mb-2 shrink-0 text-xs font-semibold uppercase text-slate-500">
            Matérias
          </h2>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
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

        {/* Assuntos */}
        <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3 lg:col-span-4">
          <h2 className="mb-2 shrink-0 text-xs font-semibold uppercase text-slate-500">
            Assuntos do banco
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingTopics ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <TecTopicTree
                trees={trees}
                flatTopics={flatTopics}
                assignedKeys={assignedKeys}
              />
            )}
          </div>
        </section>

        {/* Blocos */}
        <section className="flex min-h-0 flex-col lg:col-span-6">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <h2 className="truncate text-xs font-semibold uppercase text-slate-500">
              Blocos — {selectedName}
            </h2>
            <button
              type="button"
              onClick={createBlock}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
            >
              <Plus className="h-3 w-3" />
              Novo bloco
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {subjectBlocks.length === 0 ? (
              <div className="flex h-full min-h-[8rem] items-center justify-center rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                Crie um bloco e arraste assuntos ou pastas para cá.
              </div>
            ) : (
              subjectBlocks.map((block) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  userId={userId!}
                  subjectName={selectedName}
                  onDrop={(e) => handleDrop(block.id, block.name, e)}
                  onRemoveTopic={removeTopic}
                  onDelete={() => deleteBlock(block.id)}
                  onRename={(name) => updateBlockName(block.id, name)}
                  onNotebook={(nb) => updateBlockNotebook(block.id, nb)}
                  onStudyNote={(note) => updateBlockStudyNote(block.id, note)}
                />
              ))
            )}
          </div>

          <Link
            href="/ciclo/planejar"
            className="mt-2 shrink-0 inline-block text-sm text-teal-700 underline"
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
  userId,
  subjectName,
  onDrop,
  onRemoveTopic,
  onDelete,
  onRename,
  onNotebook,
  onStudyNote,
}: {
  block: StudyCycleContentBlock
  userId: string
  subjectName: string
  onDrop: (e: React.DragEvent) => void
  onRemoveTopic: (id: string) => void
  onDelete: () => void
  onRename: (name: string) => void
  onNotebook: (notebook: { id: string; name: string } | null) => void
  onStudyNote: (note: string) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [noteDraft, setNoteDraft] = useState(block.study_note ?? "")
  const [pickerOpen, setPickerOpen] = useState(false)
  const isManual = block.topics.length === 0
  const needsNote = isManual && !block.study_note?.trim()

  useEffect(() => {
    setNoteDraft(block.study_note ?? "")
  }, [block.id, block.study_note])

  return (
    <>
      <div
        className={`rounded-xl border-2 bg-white p-3 transition-colors ${
          dragOver
            ? "border-teal-400 bg-teal-50/30"
            : needsNote
              ? "border-amber-200"
              : "border-slate-200"
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
            className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm font-medium"
          />
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              block.notebook_id
                ? "border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
            title="Associar caderno de questões"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {block.notebook_name
              ? block.notebook_name.length > 18
                ? `${block.notebook_name.slice(0, 16)}…`
                : block.notebook_name
              : "Caderno"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 text-red-500 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {isManual && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              Manual
            </span>
          )}
        </div>

        {isManual ? (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600">
              O que você vai estudar neste bloco?
            </label>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => onStudyNote(noteDraft.trim())}
              rows={3}
              placeholder="Ex.: Redação dissertativa — 3 temas por semana"
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            />
            <p className="text-[11px] text-slate-500">
              Use para matérias sem questões no banco (ex.: discursiva). Ou solte assuntos
              aqui se tiver no banco.
            </p>
          </div>
        ) : (
          <BlockTopicGroups
            topics={block.topics}
            onRemoveTopic={onRemoveTopic}
          />
        )}
      </div>

      <NotebookPickerModal
        open={pickerOpen}
        userId={userId}
        subjectId={block.subject_id}
        subjectName={subjectName}
        currentNotebookId={block.notebook_id}
        currentNotebookName={block.notebook_name}
        onClose={() => setPickerOpen(false)}
        onSelect={(nb) => {
          onNotebook(nb)
          setPickerOpen(false)
        }}
      />
    </>
  )
}
