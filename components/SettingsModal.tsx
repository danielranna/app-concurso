"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Trash2, LogOut } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useDataCache } from "@/contexts/DataCacheContext"

type Subject = {
  id: string
  name: string
}

type Topic = {
  id: string
  name: string
}

type ErrorType = {
  id: string
  name: string
}

type Props = {
  open: boolean
  onClose: () => void
  userId: string
}

export default function SettingsModal({ open, onClose, userId }: Props) {
  const router = useRouter()
  const cache = useDataCache()
  const [tab, setTab] = useState<"subjects" | "topics" | "errorTypes" | "status">("subjects")

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [errorTypes, setErrorTypes] = useState<ErrorType[]>([])
  const [errorStatuses, setErrorStatuses] = useState<Array<{ id: string; name: string; color?: string | null }>>([])

  const [newSubject, setNewSubject] = useState("")
  const [newTopic, setNewTopic] = useState("")
  const [newErrorType, setNewErrorType] = useState("")
  const [newErrorStatus, setNewErrorStatus] = useState("")

  const [selectedSubject, setSelectedSubject] = useState("")
  const [editingColor, setEditingColor] = useState<{ [key: string]: string }>({})
  const [showColorPicker, setShowColorPicker] = useState<{ [key: string]: boolean }>({})

  /* ---------- LOADERS ---------- */

  async function loadSubjects() {
    const data = await cache.getSubjects(userId)
    setSubjects(data)
  }

  async function loadTopics(subjectId: string) {
    const res = await fetch(
      `/api/topics?user_id=${userId}&subject_id=${subjectId}`
    )
    setTopics(await res.json())
  }

  async function loadErrorTypes() {
    const data = await cache.getErrorTypes(userId)
    setErrorTypes(data ?? [])
  }

  async function loadErrorStatuses() {
    const data = await cache.getErrorStatuses(userId)
    setErrorStatuses(data)
  }

  useEffect(() => {
    if (open) {
      loadSubjects()
      loadErrorTypes()
      loadErrorStatuses()
    }
  }, [open])

  /* ---------- CRUD SUBJECT ---------- */

  async function createSubject() {
    if (!newSubject) return

    await fetch("/api/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, name: newSubject })
    })

    setNewSubject("")
    cache.invalidateSubjects(userId)
    loadSubjects()
  }

  async function deleteSubject(id: string) {
    if (!confirm("Deseja realmente excluir esta matéria?")) return

    await fetch(`/api/subjects/${id}`, { method: "DELETE" })
    cache.invalidateSubjects(userId)
    loadSubjects()
  }

  /* ---------- CRUD TOPIC ---------- */

  async function createTopic() {
    if (!newTopic || !selectedSubject) return

    await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        subject_id: selectedSubject,
        name: newTopic
      })
    })

    setNewTopic("")
    loadTopics(selectedSubject)
  }

  async function deleteTopic(id: string) {
    if (!confirm("Deseja realmente excluir este tema?")) return

    await fetch(`/api/topics/${id}`, { method: "DELETE" })
    loadTopics(selectedSubject)
  }

  /* ---------- CRUD ERROR TYPE ---------- */

  async function createErrorType() {
    if (!newErrorType) return

    await fetch("/api/error-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, name: newErrorType })
    })

    setNewErrorType("")
    cache.invalidateErrorTypes(userId)
    loadErrorTypes()
  }

  async function deleteErrorType(id: string) {
    if (!confirm("Deseja realmente excluir este tipo de erro?")) return

    await fetch(`/api/error-types/${id}`, { method: "DELETE" })
    cache.invalidateErrorTypes(userId)
    loadErrorTypes()
  }

  /* ---------- CRUD ERROR STATUS ---------- */

  async function createErrorStatus() {
    if (!newErrorStatus) return

    await fetch("/api/error-statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, name: newErrorStatus })
    })

    setNewErrorStatus("")
    cache.invalidateErrorStatuses(userId)
    loadErrorStatuses()
  }

  async function deleteErrorStatus(id: string) {
    if (!confirm("Deseja realmente excluir este status?")) return

    await fetch(`/api/error-statuses/${id}`, { method: "DELETE" })
    cache.invalidateErrorStatuses(userId)
    loadErrorStatuses()
  }

  async function saveStatusColor(id: string, color: string) {
    console.log("🎨 saveStatusColor chamado:", { id, color })
    
    // Verifica se o ID é válido (não é um status gerado automaticamente)
    if (id.startsWith("status-")) {
      console.warn("⚠️ Não é possível salvar cor para status gerado automaticamente:", id)
      alert("Não é possível definir cor para status gerados automaticamente. Crie um status personalizado primeiro.")
      cancelColorEdit(id)
      return
    }

    try {
      console.log("📤 Enviando requisição PUT para:", `/api/error-statuses/${id}`)
      console.log("📦 Payload:", { color })
      
      const res = await fetch(`/api/error-statuses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color })
      })
      
      console.log("📥 Resposta recebida:", { status: res.status, ok: res.ok })
      
      if (!res.ok) {
        const error = await res.json()
        console.error("❌ Erro ao salvar cor:", error)
        alert("Erro ao salvar cor: " + (error.error || "Erro desconhecido"))
        return
      }

      // Invalida o cache após atualizar a cor
      cache.invalidateErrorStatuses(userId)
      loadErrorStatuses()

      const result = await res.json()
      console.log("✅ Cor salva com sucesso:", result)
      
      // Fecha o picker primeiro
      setEditingColor(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setShowColorPicker(prev => ({ ...prev, [id]: false }))
      
      // Aguarda um pouco antes de recarregar para garantir que o banco foi atualizado
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Recarrega os status do banco (agora a API retorna a cor)
      await loadErrorStatuses()
      
      console.log("🔄 Status recarregados após salvar cor")
    } catch (error) {
      console.error("❌ Erro ao salvar cor (catch):", error)
      alert("Erro ao salvar cor. Tente novamente.")
    }
  }

  function openColorPicker(id: string, currentColor: string | null) {
    setEditingColor(prev => ({ ...prev, [id]: currentColor || "#e2e8f0" }))
    setShowColorPicker(prev => ({ ...prev, [id]: true }))
  }

  function cancelColorEdit(id: string) {
    setEditingColor(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setShowColorPicker(prev => ({ ...prev, [id]: false }))
  }

  /* ---------- LOGOUT ---------- */
  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-4xl rounded-xl bg-white shadow-xl">
        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">Configurações</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50"
              title="Sair da conta"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
            <button 
              onClick={onClose}
              className="text-slate-500 hover:text-slate-800"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4">
          {/* SIDEBAR */}
          <aside className="bg-slate-50 p-4 space-y-2">
            <button
              onClick={() => setTab("subjects")}
              className={`w-full rounded-lg px-3 py-2 text-left transition ${
                tab === "subjects"
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Matérias
            </button>

            <button
              onClick={() => setTab("topics")}
              className={`w-full rounded-lg px-3 py-2 text-left transition ${
                tab === "topics"
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Temas
            </button>

            <button
              onClick={() => setTab("errorTypes")}
              className={`w-full rounded-lg px-3 py-2 text-left transition ${
                tab === "errorTypes"
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Tipos de Erro
            </button>

            <button
              onClick={() => setTab("status")}
              className={`w-full rounded-lg px-3 py-2 text-left transition ${
                tab === "status"
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              Status
            </button>
          </aside>

          {/* CONTENT */}
          <main className="col-span-3 p-6">
            {tab === "subjects" && (
              <>
                <div className="mb-4 flex gap-2">
                  <input
                    className="flex-1 rounded border p-2"
                    placeholder="Nome da matéria"
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                  />
                  <button
                    onClick={createSubject}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800"
                  >
                    Adicionar
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {subjects.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
                    >
                      <span className="text-slate-800">{s.name}</span>
                      <button
                        onClick={() => deleteSubject(s.id)}
                        className="text-slate-600 hover:text-red-600 transition"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === "topics" && (
              <>
                <select
                  className="mb-3 w-full rounded border p-2"
                  value={selectedSubject}
                  onChange={e => {
                    setSelectedSubject(e.target.value)
                    loadTopics(e.target.value)
                  }}
                >
                  <option value="">Selecione a matéria</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                {selectedSubject && (
                  <>
                    <div className="mb-4 flex gap-2">
                      <input
                        className="flex-1 rounded border p-2"
                        placeholder="Nome do tema"
                        value={newTopic}
                        onChange={e => setNewTopic(e.target.value)}
                      />
                      <button
                        onClick={createTopic}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800"
                      >
                        Adicionar
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {topics.map(t => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
                        >
                          <span className="text-slate-800">{t.name}</span>
                          <button
                            onClick={() => deleteTopic(t.id)}
                            className="text-slate-600 hover:text-red-600 transition"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {tab === "errorTypes" && (
              <>
                <div className="mb-4 flex gap-2">
                  <input
                    className="flex-1 rounded border p-2"
                    placeholder="Nome do tipo de erro"
                    value={newErrorType}
                    onChange={e => setNewErrorType(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") createErrorType()
                    }}
                  />
                  <button
                    onClick={createErrorType}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800"
                  >
                    Adicionar
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {errorTypes.length === 0 ? (
                    <p className="col-span-3 text-sm text-slate-500">
                      Nenhum tipo de erro cadastrado ainda.
                    </p>
                  ) : (
                    errorTypes.map(et => (
                      <div
                        key={et.id}
                        className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
                      >
                        <span className="capitalize text-slate-800">{et.name}</span>
                        {!et.id.startsWith("type-") && (
                          <button
                            onClick={() => deleteErrorType(et.id)}
                            className="text-slate-600 hover:text-red-600 transition"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {tab === "status" && (
              <>
                <div className="mb-4 flex gap-2">
                  <input
                    className="flex-1 rounded border p-2"
                    placeholder="Nome do status"
                    value={newErrorStatus}
                    onChange={e => setNewErrorStatus(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") createErrorStatus()
                    }}
                  />
                  <button
                    onClick={createErrorStatus}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800"
                  >
                    Adicionar
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {errorStatuses.length === 0 ? (
                    <p className="col-span-3 text-sm text-slate-500">
                      Nenhum status cadastrado ainda.
                    </p>
                  ) : (
                    errorStatuses.map(status => {
                      const isDefault = ["normal", "critico", "reincidente", "aprendido"].includes(status.name)
                      const canDelete = !isDefault && !status.id.startsWith("status-")
                      
                      return (
                        <div
                          key={status.id}
                          className={`flex items-center justify-between rounded-lg p-3 ${
                            isDefault ? "bg-slate-100" : "bg-slate-50"
                          }`}
                        >
                          <span className="capitalize text-slate-800">{status.name}</span>
                          <div className="flex items-center gap-2">
                            {!status.id.startsWith("status-") && (
                              <div className="relative">
                                {!showColorPicker[status.id] ? (
                                  <button
                                    onClick={() => openColorPicker(status.id, status.color || null)}
                                    className="h-8 w-8 rounded border-2 border-slate-300 cursor-pointer transition hover:border-slate-400 shadow-sm"
                                    style={{
                                      backgroundColor: status.color || "#e2e8f0"
                                    }}
                                    title="Selecionar cor"
                                  />
                                ) : (
                                  <>
                                    <div
                                      className="fixed inset-0 z-20"
                                      onClick={() => cancelColorEdit(status.id)}
                                    />
                                    <div className="absolute right-0 z-30 mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                                      <input
                                        type="color"
                                        value={editingColor[status.id] || status.color || "#e2e8f0"}
                                        onChange={e => setEditingColor(prev => ({ ...prev, [status.id]: e.target.value }))}
                                        className="h-8 w-8 cursor-pointer rounded border border-slate-300"
                                      />
                                      <button
                                        onClick={() => saveStatusColor(status.id, editingColor[status.id] || status.color || "#e2e8f0")}
                                        className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
                                        title="Aplicar cor"
                                      >
                                        OK
                                      </button>
                                      <button
                                        onClick={() => cancelColorEdit(status.id)}
                                        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                                        title="Cancelar"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => deleteErrorStatus(status.id)}
                                className="text-slate-600 hover:text-red-600 transition"
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
