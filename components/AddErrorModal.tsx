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

type Props = {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AddErrorModal({
  isOpen,
  onClose,
  onSuccess
}: Props) {
  const [userId, setUserId] = useState<string | null>(null)

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])

  const [selectedSubject, setSelectedSubject] = useState("")
  const [selectedTopic, setSelectedTopic] = useState("")

  const [errorText, setErrorText] = useState("")
  const [correctionText, setCorrectionText] = useState("")
  const [description, setDescription] = useState("")
  const [referenceLink, setReferenceLink] = useState("")

  const [errorStatus, setErrorStatus] = useState<
    "normal" | "critico" | "reincidente" | "aprendido"
  >("normal")

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  // 🔐 carrega usuário + matérias
  async function loadUserAndSubjects() {
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) return

    setUserId(user.id)

    const res = await fetch(`/api/subjects?user_id=${user.id}`)
    const data = await res.json()
    setSubjects(data)
  }

  // 🧩 carrega temas ao selecionar matéria
  async function loadTopics(subjectId: string) {
    if (!userId) return

    const res = await fetch(
      `/api/topics?user_id=${userId}&subject_id=${subjectId}`
    )
    const data = await res.json()
    setTopics(data)
  }

  // 🧼 limpa formulário
  function resetForm() {
    setSelectedSubject("")
    setSelectedTopic("")
    setTopics([])
    setErrorText("")
    setCorrectionText("")
    setDescription("")
    setReferenceLink("")
    setErrorStatus("normal")
    setMessage("")
  }

  // ➕ salvar erro
  async function handleSubmit() {
    if (!userId || !selectedTopic || !errorText || !correctionText) {
      setMessage("Preencha os campos obrigatórios.")
      return
    }

    setLoading(true)

    const res = await fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        topic_id: selectedTopic,
        error_text: errorText,
        correction_text: correctionText,
        description,
        reference_link: referenceLink,
        error_status: errorStatus
      })
    })

    setLoading(false)

    if (!res.ok) {
      setMessage("Erro ao salvar.")
      return
    }

    resetForm()
    onSuccess?.()
    onClose()
  }

  // 🔄 ao abrir modal
  useEffect(() => {
    if (isOpen) {
      resetForm()
      loadUserAndSubjects()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg">
        {/* HEADER */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">
            Adicionar erro
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
            ✕
          </button>
        </div>

        {/* FORM */}
        <div className="space-y-3">
          {/* MATÉRIA */}
          <select
            className="w-full rounded border p-2"
            value={selectedSubject}
            onChange={e => {
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

          {/* TEMA */}
          <select
            className="w-full rounded border p-2"
            value={selectedTopic}
            onChange={e => setSelectedTopic(e.target.value)}
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

          {/* STATUS */}
          <div className="flex gap-2">
            {["normal", "critico", "reincidente", "aprendido"].map(status => (
              <button
                key={status}
                onClick={() =>
                  setErrorStatus(
                    status as "normal" | "critico" | "reincidente" | "aprendido"
                  )
                }
                className={`rounded px-3 py-1 text-sm ${
                  errorStatus === status
                    ? "bg-slate-900 text-white"
                    : "border text-slate-700"
                }`}
              >
                {status}
              </button>
            ))}
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
            className="rounded bg-slate-900 px-4 py-2 text-white"
          >
            {loading ? "Salvando..." : "OK"}
          </button>
        </div>
      </div>
    </div>
  )
}
