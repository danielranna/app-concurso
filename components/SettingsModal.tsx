"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, LogOut } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useDataCache } from "@/contexts/DataCacheContext"

type ErrorType = {
  id: string
  name: string
}

type Props = {
  open: boolean
  onClose: () => void
  userId: string
  /** Chamado após qualquer alteração (tipos, status) para o pai atualizar sem F5 */
  onDataChange?: () => void
}

export default function SettingsModal({ open, onClose, userId, onDataChange }: Props) {
  const router = useRouter()
  const cache = useDataCache()
  const [tab, setTab] = useState<"errorTypes" | "status">("errorTypes")

  const [errorTypes, setErrorTypes] = useState<ErrorType[]>([])
  const [errorStatuses, setErrorStatuses] = useState<Array<{ id: string; name: string; color?: string | null }>>([])

  const [newErrorType, setNewErrorType] = useState("")
  const [newErrorStatus, setNewErrorStatus] = useState("")

  const [editingColor, setEditingColor] = useState<{ [key: string]: string }>({})
  const [showColorPicker, setShowColorPicker] = useState<{ [key: string]: boolean }>({})

  /* ---------- LOADERS ---------- */

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
      loadErrorTypes()
      loadErrorStatuses()
    }
  }, [open])

  /* ---------- CRUD ERROR TYPE ---------- */

  async function createErrorType() {
    if (!newErrorType) return
    const name = newErrorType.trim()
    setNewErrorType("")

    const res = await fetch("/api/error-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, name })
    })
    const json = await res.json()
    if (res.ok && json.data) {
      setErrorTypes(prev => [...prev, { id: json.data.id, name: json.data.name }])
      cache.invalidateErrorTypes(userId)
      onDataChange?.()
    } else if (res.ok) {
      const tempId = `temp-type-${Date.now()}`
      setErrorTypes(prev => [...prev, { id: tempId, name }])
      cache.invalidateErrorTypes(userId)
      onDataChange?.()
    }
  }

  async function deleteErrorType(id: string) {
    if (!confirm("Deseja realmente excluir este tipo de erro?")) return
    const removed = errorTypes.find(e => e.id === id)
    if (!removed) return
    if (id.startsWith("temp-")) {
      setErrorTypes(prev => prev.filter(e => e.id !== id))
      onDataChange?.()
      return
    }
    setErrorTypes(prev => prev.filter(e => e.id !== id))
    const res = await fetch(`/api/error-types/${id}`, { method: "DELETE" })
    if (res.ok) {
      cache.invalidateErrorTypes(userId)
      onDataChange?.()
    } else {
      setErrorTypes(prev => [...prev, removed])
    }
  }

  /* ---------- CRUD ERROR STATUS ---------- */

  async function createErrorStatus() {
    if (!newErrorStatus) return
    const name = newErrorStatus.trim()
    setNewErrorStatus("")

    const res = await fetch("/api/error-statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, name })
    })
    const json = await res.json()
    if (res.ok && json.data) {
      setErrorStatuses(prev => [...prev, { id: json.data.id, name: json.data.name, color: json.data.color ?? null }])
      cache.invalidateErrorStatuses(userId)
      onDataChange?.()
    } else if (res.ok) {
      const tempId = `temp-status-${Date.now()}`
      setErrorStatuses(prev => [...prev, { id: tempId, name, color: null }])
      cache.invalidateErrorStatuses(userId)
      onDataChange?.()
    }
  }

  async function deleteErrorStatus(id: string) {
    if (!confirm("Deseja realmente excluir este status?")) return
    const removed = errorStatuses.find(s => s.id === id)
    if (!removed) return
    if (id.startsWith("temp-") || id.startsWith("status-")) {
      setErrorStatuses(prev => prev.filter(s => s.id !== id))
      onDataChange?.()
      return
    }
    setErrorStatuses(prev => prev.filter(s => s.id !== id))
    const res = await fetch(`/api/error-statuses/${id}`, { method: "DELETE" })
    if (res.ok) {
      cache.invalidateErrorStatuses(userId)
      onDataChange?.()
    } else {
      setErrorStatuses(prev => [...prev, removed])
    }
  }

  async function saveStatusColor(id: string, color: string) {
    if (id.startsWith("status-")) {
      alert("Não é possível definir cor para status gerados automaticamente. Crie um status personalizado primeiro.")
      cancelColorEdit(id)
      return
    }
    const previousColor = errorStatuses.find(s => s.id === id)?.color ?? null
    setErrorStatuses(prev =>
      prev.map(s => (s.id === id ? { ...s, color } : s))
    )
    setEditingColor(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setShowColorPicker(prev => ({ ...prev, [id]: false }))

    const res = await fetch(`/api/error-statuses/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color })
    })
    if (res.ok) {
      cache.invalidateErrorStatuses(userId)
      onDataChange?.()
    } else {
      setErrorStatuses(prev =>
        prev.map(s => (s.id === id ? { ...s, color: previousColor } : s))
      )
      const err = await res.json().catch(() => ({}))
      alert("Erro ao salvar cor: " + (err.error || "Tente novamente."))
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
            <p className="px-1 pb-2 text-xs text-slate-500">
              Matérias e temas agora ficam em{" "}
              <a href="/materias" className="font-medium text-slate-800 underline">
                Matérias
              </a>
              .
            </p>
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
            {tab === "errorTypes" && (
              <>
                <div className="mb-4 flex gap-2">
                  <input
                    className="flex-1 rounded border border-slate-300 p-2 text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300"
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
                    <p className="col-span-3 text-sm text-slate-700">
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
                    className="flex-1 rounded border border-slate-300 p-2 text-slate-900 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300"
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
                    <p className="col-span-3 text-sm text-slate-700">
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
