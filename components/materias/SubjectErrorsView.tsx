"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import ErrorCard from "@/components/ErrorCard"
import AddErrorModal from "@/components/AddErrorModal"
import ErrorsByTopicChart from "@/components/ErrorsByTopicChart"
import { Eye, Filter, Plus } from "lucide-react"
import { useDataCache } from "@/contexts/DataCacheContext"

type ErrorItem = {
  id: string
  error_text: string
  correction_text: string
  description?: string
  reference_link?: string
  error_status: string
  error_type?: string
  created_at: string
  topics: {
    id: string
    name: string
    subject_id: string
    subjects: { id: string; name: string }
  }
}

type Props = {
  subjectId: string
  embedded?: boolean
}

export default function SubjectErrorsView({ subjectId, embedded = false }: Props) {
  const cache = useDataCache()
  const [mounted, setMounted] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [errors, setErrors] = useState<ErrorItem[]>([])
  const [loading, setLoading] = useState(true)
  const [topics, setTopics] = useState<Array<{ id: string; name: string }>>([])
  const [errorTypes, setErrorTypes] = useState<Array<{ id: string; name: string }>>([])
  const [errorStatuses, setErrorStatuses] = useState<Array<{ id: string; name: string }>>([])
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [selectedErrorTypes, setSelectedErrorTypes] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [openFilterMenu, setOpenFilterMenu] = useState<"topics" | "errorTypes" | "statuses" | null>(
    null
  )
  const [allCardsExpanded, setAllCardsExpanded] = useState(false)
  const [openModal, setOpenModal] = useState(false)
  const [editingError, setEditingError] = useState<null | {
    id: string
    topic_id: string
    subject_id: string
    error_text: string
    correction_text: string
    description?: string
    reference_link?: string
    error_type?: string
    error_status?: string
  }>(null)

  async function loadErrors(uid: string) {
    setLoading(true)
    const data = await cache.getErrors(uid, {
      subject_id: subjectId,
      topic_ids: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
      error_types: selectedErrorTypes.length > 0 ? selectedErrorTypes : undefined,
      error_statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
    })
    setErrors(data ?? [])
    setLoading(false)
  }

  function handleEdit(error: ErrorItem) {
    setEditingError({
      id: error.id,
      topic_id: error.topics.id,
      subject_id: error.topics.subject_id,
      error_text: error.error_text,
      correction_text: error.correction_text,
      description: error.description,
      reference_link: error.reference_link,
      error_type: error.error_type,
      error_status: error.error_status,
    })
    setOpenModal(true)
  }

  async function handleDelete(errorId: string) {
    if (!confirm("Deseja realmente excluir este erro?")) return
    const res = await fetch(`/api/errors/${errorId}`, { method: "DELETE" })
    if (res.ok && userId) {
      cache.invalidateErrors(userId, subjectId)
      loadErrors(userId)
    }
  }

  useEffect(() => {
    setMounted(true)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  useEffect(() => {
    if (!userId) return
    fetch(`/api/topics?user_id=${userId}&subject_id=${subjectId}`)
      .then((r) => r.json())
      .then((d) => setTopics(d ?? []))
    cache.getErrorTypes(userId).then((d) => setErrorTypes(d ?? []))
    cache.getErrorStatuses(userId).then((d) => setErrorStatuses(d))
  }, [userId, subjectId, cache])

  useEffect(() => {
    if (userId) loadErrors(userId)
  }, [userId, subjectId, selectedTopicIds, selectedErrorTypes, selectedStatuses])

  return (
    <div className={embedded ? "" : "min-h-screen bg-slate-50 px-4 py-6 sm:px-6"}>
      {!embedded && (
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-800">Erros da matéria</h1>
        </header>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Mapa de erros manual desta matéria.</p>
        <button
          type="button"
          onClick={() => {
            setEditingError({
              id: "",
              topic_id: "",
              subject_id: subjectId,
              error_text: "",
              correction_text: "",
              description: "",
              reference_link: "",
              error_type: "",
              error_status: "",
            })
            setOpenModal(true)
          }}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Adicionar erro
        </button>
      </div>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <ErrorsByTopicChart errors={errors} subjectId={subjectId} />
      </section>

      {errors.length > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setAllCardsExpanded(!allCardsExpanded)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <Eye className="h-4 w-4" />
            {allCardsExpanded ? "Ocultar todos" : "Mostrar todos"}
          </button>
        </div>
      )}

      <section className="relative mb-6 flex flex-wrap gap-2">
        {(["topics", "errorTypes", "statuses"] as const).map((kind) => {
          const labels = { topics: "Tema", errorTypes: "Tipo de erro", statuses: "Status" }
          const counts = {
            topics: selectedTopicIds.length,
            errorTypes: selectedErrorTypes.length,
            statuses: selectedStatuses.length,
          }
          const items =
            kind === "topics"
              ? topics.map((t) => ({ id: t.id, name: t.name }))
              : kind === "errorTypes"
                ? errorTypes.map((t) => ({ id: t.name, name: t.name }))
                : errorStatuses.map((s) => ({ id: s.name, name: s.name }))
          const selected =
            kind === "topics"
              ? selectedTopicIds
              : kind === "errorTypes"
                ? selectedErrorTypes
                : selectedStatuses
          const setSelected =
            kind === "topics"
              ? setSelectedTopicIds
              : kind === "errorTypes"
                ? setSelectedErrorTypes
                : setSelectedStatuses

          return (
            <div key={kind} className="relative">
              <button
                type="button"
                onClick={() => setOpenFilterMenu(openFilterMenu === kind ? null : kind)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  counts[kind] > 0
                    ? "border-slate-900 bg-slate-100 text-slate-900"
                    : "border-slate-300 text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Filter className="h-4 w-4" />
                {labels[kind]}
                {counts[kind] > 0 && (
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">
                    {counts[kind]}
                  </span>
                )}
              </button>
              {mounted && openFilterMenu === kind && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenFilterMenu(null)} />
                  <div className="absolute top-full left-0 z-20 mt-2 max-h-64 w-64 overflow-auto rounded-lg border bg-white p-3 shadow-lg">
                    {items.length === 0 ? (
                      <p className="text-sm text-slate-500">Nenhum item</p>
                    ) : (
                      items.map((item) => (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(item.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelected([...selected, item.id])
                              else setSelected(selected.filter((id) => id !== item.id))
                            }}
                            className="rounded"
                          />
                          <span className="text-sm capitalize">{item.name}</span>
                        </label>
                      ))
                    )}
                    {selected.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelected([])}
                        className="mt-2 w-full text-xs text-red-600 hover:underline"
                      >
                        Limpar seleção
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </section>

      {loading ? (
        <p className="text-slate-500">Carregando erros…</p>
      ) : errors.length === 0 ? (
        <p className="text-slate-500">Nenhum erro registrado nesta matéria.</p>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {errors.map((error) => (
            <ErrorCard
              key={error.id}
              error={error}
              onEdit={() => handleEdit(error)}
              onDeleted={() => handleDelete(error.id)}
              allCardsExpanded={allCardsExpanded}
              availableStatuses={errorStatuses}
              onStatusChange={async (errorId, newStatus) => {
                const previousStatus = error.error_status
                setErrors((prev) =>
                  prev.map((e) => (e.id === errorId ? { ...e, error_status: newStatus } : e))
                )
                const res = await fetch(`/api/errors/${errorId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    user_id: userId,
                    topic_id: error.topics.id,
                    error_text: error.error_text,
                    correction_text: error.correction_text,
                    description: error.description,
                    reference_link: error.reference_link,
                    error_type: error.error_type,
                    error_status: newStatus,
                  }),
                })
                if (res.ok && userId) {
                  cache.invalidateErrors(userId, subjectId)
                  await cache.getErrorStatuses(userId).then(setErrorStatuses)
                } else {
                  setErrors((prev) =>
                    prev.map((e) =>
                      e.id === errorId ? { ...e, error_status: previousStatus } : e
                    )
                  )
                }
              }}
            />
          ))}
        </section>
      )}

      <AddErrorModal
        isOpen={openModal}
        onClose={() => {
          setOpenModal(false)
          setEditingError(null)
        }}
        initialData={editingError}
        onSuccess={() => {
          if (!userId) return
          cache.invalidateErrors(userId, subjectId)
          loadErrors(userId)
          cache.getErrorTypes(userId).then((d) => setErrorTypes(d ?? []))
          cache.getErrorStatuses(userId).then(setErrorStatuses)
        }}
      />
    </div>
  )
}
