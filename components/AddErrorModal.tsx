"use client"

import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { supabase } from "@/lib/supabase"
import RichTextEditor from "@/components/RichTextEditor"

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
  error_status?: string // Aceita qualquer string para suportar status personalizados
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
  const [errorStatuses, setErrorStatuses] = useState<Array<{ id: string; name: string }>>([])

  const [selectedSubject, setSelectedSubject] = useState("")
  const [selectedTopic, setSelectedTopic] = useState("")
  const [showNewTopicModal, setShowNewTopicModal] = useState(false)
  const [newTopicName, setNewTopicName] = useState("")
  const [creatingTopic, setCreatingTopic] = useState(false)

  const [errorText, setErrorText] = useState("")
  const [correctionText, setCorrectionText] = useState("")
  const [description, setDescription] = useState("")
  const [referenceLink, setReferenceLink] = useState("")
  const [errorType, setErrorType] = useState("")
  const [errorStatus, setErrorStatus] = useState<string>("")

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

    const [subjectsRes, errorTypesRes, errorStatusesRes] = await Promise.all([
      fetch(`/api/subjects?user_id=${user.id}`),
      fetch(`/api/error-types?user_id=${user.id}`).catch(() => 
        new Response(JSON.stringify([]), { status: 200 })
      ),
      fetch(`/api/error-statuses?user_id=${user.id}`).catch(() => 
        new Response(JSON.stringify([]), { status: 200 })
      )
    ])

    const subjectsData = await subjectsRes.json()
    let errorTypesData = []
    let errorStatusesData = []
    
    if (errorTypesRes.ok) {
      errorTypesData = await errorTypesRes.json()
    } else {
      console.error("Erro ao carregar tipos de erro:", errorTypesRes.status)
      errorTypesData = []
    }

    if (errorStatusesRes.ok) {
      const statusesData = await errorStatusesRes.json()
      errorStatusesData = statusesData.map((item: any, index: number) => {
        if (typeof item === 'string') {
          return { id: `status-${index}`, name: item }
        }
        return { id: item.id || `status-${index}`, name: item.name || item }
      })
    } else {
      // Se não conseguir carregar, retorna vazio (sem status padrão)
      errorStatusesData = []
    }

    console.log("📚 subjects:", subjectsData)
    console.log("📋 error types:", errorTypesData)
    console.log("📊 error statuses:", errorStatusesData)

    // Ordena subjects alfabeticamente
    const sortedSubjects = (subjectsData ?? []).sort((a: Subject, b: Subject) => 
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    )

    setSubjects(sortedSubjects)
    setErrorTypes(errorTypesData ?? [])
    setErrorStatuses(errorStatusesData)
    
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

    // Ordena topics alfabeticamente
    const sortedTopics = (data ?? []).sort((a: Topic, b: Topic) => 
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    )

    setTopics(sortedTopics)
    return sortedTopics
  }

  async function createNewTopic() {
    if (!newTopicName.trim() || !selectedSubject || !userId || creatingTopic) return

    setCreatingTopic(true)
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          subject_id: selectedSubject,
          name: newTopicName.trim()
        })
      })

      if (res.ok) {
        const newTopics = await loadTopics(selectedSubject)
        // Seleciona o tema recém-criado
        const newTopic = newTopics.find(t => t.name === newTopicName.trim())
        if (newTopic) {
          setSelectedTopic(newTopic.id)
        }
        setNewTopicName("")
        setShowNewTopicModal(false)
      } else {
        const error = await res.json()
        alert("Erro ao criar tema: " + (error.error || "Erro desconhecido"))
      }
    } catch (error) {
      console.error("Erro ao criar tema:", error)
      alert("Erro ao criar tema. Tente novamente.")
    } finally {
      setCreatingTopic(false)
    }
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
    setErrorStatus(errorStatuses.length > 0 ? errorStatuses[0].name : "")
    setMessage("")
  }

  /* =====================
     PRELOAD EDIT / INITIAL DATA
  ===================== */
  async function preloadEdit(data: InitialError, userIdParam: string) {
    console.log("🟠 preloadEdit iniciado", data)

    // Sempre define o subject_id se existir (mesmo para novos erros)
    if (data.subject_id) {
      setSelectedSubject(data.subject_id)
      // Carrega os topics do subject selecionado
      await loadTopics(data.subject_id, userIdParam)
    }

    // Se for edição (tem id), carrega todos os campos
    if (data.id) {
      setErrorText(data.error_text)
      setCorrectionText(data.correction_text)
      setDescription(data.description ?? "")
      setReferenceLink(data.reference_link ?? "")
      setErrorType(data.error_type ?? "")
      // Usa o status do erro se existir, senão usa o primeiro disponível ou "normal"
      if (data.error_status) {
        const statusExists = errorStatuses.find(s => s.name === data.error_status)
        if (statusExists) {
          setErrorStatus(data.error_status)
        } else {
          // Se não existe na lista, ainda usa o valor do erro
          setErrorStatus(data.error_status)
        }
      } else {
        setErrorStatus(errorStatuses.length > 0 ? errorStatuses[0].name : "")
      }

      // Se tem topic_id, seleciona o topic
      if (data.topic_id) {
        console.log("🟡 carregando topics do subject:", data.subject_id)
        const loadedTopics = await loadTopics(data.subject_id, userIdParam)
        console.log("🟢 topics carregados:", loadedTopics)
        console.log("🟢 tentando selecionar topic_id:", data.topic_id)

        const exists = loadedTopics.find(t => t.id === data.topic_id)
        console.log("🔎 topic existe?", exists)

        if (exists) {
          setSelectedTopic(data.topic_id)
        }
      }
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
      const [errorTypesRes, errorStatusesRes] = await Promise.all([
        fetch(`/api/error-types?user_id=${userId}`).catch(() => 
          new Response(JSON.stringify([]), { status: 200 })
        ),
        fetch(`/api/error-statuses?user_id=${userId}`).catch(() => 
          new Response(JSON.stringify([]), { status: 200 })
        )
      ])
      
      if (errorTypesRes.ok) {
        const errorTypesData = await errorTypesRes.json()
        setErrorTypes(errorTypesData ?? [])
      }
      
      if (errorStatusesRes.ok) {
        const statusesData = await errorStatusesRes.json()
        const statuses = statusesData.map((item: any, index: number) => {
          if (typeof item === 'string') {
            return { id: `status-${index}`, name: item }
          }
          return { id: item.id || `status-${index}`, name: item.name || item }
        })
        setErrorStatuses(statuses)
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
        // Se tem initialData, pré-carrega (pode ser edição ou novo erro com subject pré-selecionado)
        await preloadEdit(initialData, userIdFromLoad)
      } else {
        // Se não tem initialData, reseta o formulário
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-xl bg-white shadow-lg flex flex-col">
        {/* HEADER */}
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b">
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

        {/* FORM - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Matéria
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 p-2 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-0"
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
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Tema
            </label>
            <div className="flex gap-2">
              <select
                className="flex-1 rounded-lg border border-slate-300 p-2 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-0 disabled:bg-slate-100 disabled:cursor-not-allowed"
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
              {selectedSubject && (
                <button
                  type="button"
                  onClick={() => {
                    setShowNewTopicModal(true)
                    setNewTopicName("")
                  }}
                  className="flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!selectedSubject}
                  title="Criar novo tema"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Erro <span className="text-red-500">*</span>
            </label>
            <RichTextEditor
              value={errorText}
              onChange={setErrorText}
              placeholder="Digite o erro cometido"
              rows={3}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Correção <span className="text-red-500">*</span>
            </label>
            <RichTextEditor
              value={correctionText}
              onChange={setCorrectionText}
              placeholder="Digite a correção"
              rows={3}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Link para questão <span className="text-slate-400 text-xs">(opcional)</span>
            </label>
            <input
              className="w-full rounded-lg border border-slate-300 p-2 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-0"
              placeholder="Cole o link da questão aqui"
              value={referenceLink}
              onChange={e => setReferenceLink(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Descrição <span className="text-slate-400 text-xs">(opcional)</span>
            </label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="Adicione informações adicionais sobre o erro"
              rows={3}
            />
          </div>

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
                        ? "bg-slate-900 text-white"
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
              {errorStatuses.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nenhum status cadastrado. Adicione status em Configurações.
                </p>
              ) : (
                errorStatuses.map(status => (
                  <button
                    key={status.id}
                    type="button"
                    onClick={() => setErrorStatus(status.name)}
                    className={`rounded px-3 py-1 text-sm capitalize ${
                      errorStatus === status.name
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {status.name}
                  </button>
                ))
              )}
            </div>
          </div>

          {message && (
            <p className="text-sm text-red-600">{message}</p>
          )}
        </div>

        {/* MODAL CRIAR TEMA */}
        {showNewTopicModal && (
          <>
            <div
              className="fixed inset-0 z-[60] bg-black/40"
              onClick={() => {
                if (!creatingTopic) {
                  setShowNewTopicModal(false)
                  setNewTopicName("")
                }
              }}
            />
            <div className="fixed left-1/2 top-1/2 z-[70] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <h3 className="mb-4 text-lg font-semibold text-slate-800">
                Criar Novo Tema
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">
                    Nome do Tema
                  </label>
                  <input
                    type="text"
                    value={newTopicName}
                    onChange={e => setNewTopicName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !creatingTopic) {
                        createNewTopic()
                      }
                      if (e.key === "Escape") {
                        setShowNewTopicModal(false)
                        setNewTopicName("")
                      }
                    }}
                    placeholder="Digite o nome do tema"
                    className="w-full rounded-lg border border-slate-300 p-2 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    autoFocus
                    disabled={creatingTopic}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewTopicModal(false)
                      setNewTopicName("")
                    }}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                    disabled={creatingTopic}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={createNewTopic}
                    disabled={!newTopicName.trim() || creatingTopic}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creatingTopic ? "Criando..." : "OK"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* FOOTER */}
        <div className="flex-shrink-0 flex justify-between p-6 border-t bg-white rounded-b-xl">
          <button
            onClick={onClose}
            className="rounded border px-4 py-2 text-slate-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  )
}
