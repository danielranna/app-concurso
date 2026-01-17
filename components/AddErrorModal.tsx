"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Subject = {
  id: string
  name: string
}

type Topic = {
  id: string
  name: string
}

type ErrorTypeItem = {
  id: string
  name: string
}

type ErrorStatus = "normal" | "critico" | "reincidente" | "aprendido"

type InitialError = {
  id: string
  topic_id: string
  subject_id: string
  error_text: string
  correction_text: string
  description?: string
  reference_link?: string
  error_type?: string
  error_status?: ErrorStatus
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  initialData?: InitialError | null
}

export default function AddErrorModal({
  isOpen,
  onClose,
  onSuccess,
  initialData
}: Props) {
  console.log("🟢 RENDER MODAL", { isOpen, initialData })

  const [userId, setUserId] = useState<string | null>(null)

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [errorTypes, setErrorTypes] = useState<ErrorTypeItem[]>([])

  const [selectedSubject, setSelectedSubject] = useState("")
  const [selectedTopic, setSelectedTopic] = useState("")

  const [errorText, setErrorText] = useState("")
  const [correctionText, setCorrectionText] = useState("")
  const [description, setDescription] = useState("")
  const [referenceLink, setReferenceLink] = useState("")
  const [errorType, setErrorType] = useState("")
  const [errorStatus, setErrorStatus] = useState<ErrorStatus>("normal")

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  /* =====================
     LOAD USER + SUBJECTS + ERROR TYPES
  ===================== */
  async function loadUserAndSubjects() {
    console.log("🔐 loadUserAndSubjects")

    const {
      data: { user }
    } = await supabase.auth.getUser()

    console.log("👤 usuário:", user)

    if (!user) return null

    setUserId(user.id)

    const [subjectsRes, errorTypesRes] = await Promise.all([
      fetch(`/api/subjects?user_id=${user.id}`),
      fetch(`/api/error-types?user_id=${user.id}`).catch(() => 
        new Response(JSON.stringify([]), { status: 200 })
      )
    ])

    const subjectsData = await subjectsRes.json()
    let errorTypesData = []
    
    if (errorTypesRes.ok) {
      errorTypesData = await errorTypesRes.json()
    } else {
      console.error("Erro ao carregar tipos de erro:", errorTypesRes.status)
      errorTypesData = []
    }

    console.log("📚 subjects:", subjectsData)
    console.log("📋 error types:", errorTypesData)

    setSubjects(subjectsData ?? [])
    setErrorTypes(errorTypesData ?? [])
    
    return user.id
  }

  async function loadTopics(subjectId: string, userIdParam?: string): Promise<Topic[]> {
    const currentUserId = userIdParam || userId
    
    console.log("🔵 loadTopics chamado", { subjectId, currentUserId })

    if (!currentUserId) {
      console.log("❌ userId ainda não definido")
      return []
    }

    const res = await fetch(
      `/api/topics?user_id=${currentUserId}&subject_id=${subjectId}`
    )

    const data = await res.json()

    console.log("🟣 topics retornados da API:", data)

    setTopics(data)
    return data
  }

  function resetForm() {
    console.log("🧼 resetForm")

    setSelectedSubject("")
    setSelectedTopic("")
    setTopics([])
    setErrorText("")
    setCorrectionText("")
    setDescription("")
    setReferenceLink("")
    setErrorType("")
    setErrorStatus("normal")
    setMessage("")
  }

  /* =====================
     PRELOAD EDIT
  ===================== */
  async function preloadEdit(data: InitialError, userIdParam: string) {
    console.log("🟠 preloadEdit iniciado", data)

    setSelectedSubject(data.subject_id)
    setErrorText(data.error_text)
    setCorrectionText(data.correction_text)
    setDescription(data.description ?? "")
    setReferenceLink(data.reference_link ?? "")
    setErrorType(data.error_type ?? "")
    setErrorStatus(data.error_status ?? "normal")

    console.log("🟡 carregando topics do subject:", data.subject_id)

    const loadedTopics = await loadTopics(data.subject_id, userIdParam)

    console.log("🟢 topics carregados:", loadedTopics)
    console.log("🟢 tentando selecionar topic_id:", data.topic_id)

    const exists = loadedTopics.find(
      t => t.id === data.topic_id
    )

    console.log("🔎 topic existe?", exists)

    if (exists) {
      setSelectedTopic(data.topic_id)
    }
  }

  /* =====================
     SUBMIT (CREATE / EDIT)
  ===================== */
  async function handleSubmit() {
    console.log("🚀 handleSubmit", {
      userId,
      selectedSubject,
      selectedTopic,
      errorText,
      correctionText
    })

    if (!userId || !selectedTopic || !errorText || !correctionText) {
      setMessage("Preencha os campos obrigatórios.")
      return
    }

    setLoading(true)

    const isEdit = Boolean(initialData?.id)

    const res = await fetch(
      isEdit ? `/api/errors/${initialData!.id}` : "/api/errors",
      {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          topic_id: selectedTopic,
          error_text: errorText,
          correction_text: correctionText,
          description,
          reference_link: referenceLink,
          error_type: errorType,
          error_status: errorStatus
        })
      }
    )

    setLoading(false)

    console.log("📡 resposta salvar:", res.status)

    if (!res.ok) {
      setMessage("Erro ao salvar.")
      return
    }

    // Recarrega tipos e status após criar/editar erro
    if (userId) {
      const errorTypesRes = await fetch(`/api/error-types?user_id=${userId}`).catch(() => 
        new Response(JSON.stringify([]), { status: 200 })
      )
      if (errorTypesRes.ok) {
        const errorTypesData = await errorTypesRes.json()
        setErrorTypes(errorTypesData ?? [])
      }
    }

    resetForm()
    onSuccess?.()
    onClose()
  }

  /* =====================
     OPEN MODAL
  ===================== */
  useEffect(() => {
    if (!isOpen) return

    console.log("🔓 MODAL ABERTO", { initialData })

    async function init() {
      const userIdFromLoad = await loadUserAndSubjects()

      if (initialData && userIdFromLoad) {
        await preloadEdit(initialData, userIdFromLoad)
      } else {
        resetForm()
      }
    }

    init()
  }, [isOpen, initialData])

  /* =====================
     WATCH STATES
  ===================== */
  useEffect(() => {
    console.log("📦 ESTADO ATUAL", {
      userId,
      selectedSubject,
      selectedTopic,
      topics
    })
  }, [userId, selectedSubject, selectedTopic, topics])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg">
        {/* HEADER */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">
            {initialData ? "Editar erro" : "Adicionar erro"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800"
          >
            ✕
          </button>
        </div>

        {/* FORM */}
        <div className="space-y-3">
          <select
            className="w-full rounded border p-2"
            value={selectedSubject}
            onChange={e => {
              console.log("📘 subject selecionado", e.target.value)
              setSelectedSubject(e.target.value)
              setSelectedTopic("")
              loadTopics(e.target.value)
            }}
          >
            <option value="">Selecionar matéria</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            className="w-full rounded border p-2"
            value={selectedTopic}
            onChange={e => {
              console.log("📙 topic selecionado", e.target.value)
              setSelectedTopic(e.target.value)
            }}
            disabled={!selectedSubject}
          >
            <option value="">Selecionar tema</option>
            {topics.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <textarea
            className="w-full rounded border p-2"
            placeholder="Erro"
            value={errorText}
            onChange={e => setErrorText(e.target.value)}
          />

          <textarea
            className="w-full rounded border p-2"
            placeholder="Correção"
            value={correctionText}
            onChange={e => setCorrectionText(e.target.value)}
          />

          <input
            className="w-full rounded border p-2"
            placeholder="Link para questão (opcional)"
            value={referenceLink}
            onChange={e => setReferenceLink(e.target.value)}
          />

          <textarea
            className="w-full rounded border p-2"
            placeholder="Descrição (opcional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />

          {/* TIPO DE ERRO */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Tipo de erro
            </label>
            <div className="flex flex-wrap gap-2">
              {errorTypes.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhum tipo de erro cadastrado. Adicione tipos em Configurações.
                </p>
              ) : (
                errorTypes.map(type => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setErrorType(type.name)}
                    className={`rounded px-3 py-1 text-sm ${
                      errorType === type.name
                        ? "bg-purple-600 text-white"
                        : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {type.name}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* STATUS DO ERRO */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Status do erro
            </label>
            <div className="flex flex-wrap gap-2">
              {(["normal", "critico", "reincidente", "aprendido"] as ErrorStatus[]).map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setErrorStatus(status)}
                  className={`rounded px-3 py-1 text-sm capitalize ${
                    errorStatus === status
                      ? "bg-purple-600 text-white"
                      : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {message && (
            <p className="text-sm text-red-600">{message}</p>
          )}
        </div>

        {/* FOOTER */}
        <div className="mt-6 flex justify-between">
          <button
            onClick={onClose}
            className="rounded border px-4 py-2 text-slate-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  )
}
