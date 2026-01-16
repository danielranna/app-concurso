"use client"

import { useEffect, useState } from "react"

type Subject = {
  id: string
  name: string
}

type Topic = {
  id: string
  name: string
}

type Props = {
  open: boolean
  onClose: () => void
  userId: string
}

export default function SettingsModal({ open, onClose, userId }: Props) {
  const [tab, setTab] = useState<"subjects" | "topics">("subjects")

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])

  const [newSubject, setNewSubject] = useState("")
  const [newTopic, setNewTopic] = useState("")

  const [selectedSubject, setSelectedSubject] = useState("")

  /* ---------- LOADERS ---------- */

  async function loadSubjects() {
    const res = await fetch(`/api/subjects?user_id=${userId}`)
    setSubjects(await res.json())
  }

  async function loadTopics(subjectId: string) {
    const res = await fetch(
      `/api/topics?user_id=${userId}&subject_id=${subjectId}`
    )
    setTopics(await res.json())
  }

  useEffect(() => {
    if (open) loadSubjects()
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
    loadSubjects()
  }

  async function deleteSubject(id: string) {
    if (!confirm("Deseja realmente excluir esta matéria?")) return

    await fetch(`/api/subjects/${id}`, { method: "DELETE" })
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

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-4xl rounded-xl bg-white shadow-xl">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Configurações</h2>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="grid grid-cols-4">
          {/* SIDEBAR */}
          <aside className="border-r p-4 space-y-2">
            <button
              onClick={() => setTab("subjects")}
              className={`w-full rounded px-3 py-2 text-left ${
                tab === "subjects"
                  ? "bg-violet-100 text-violet-700"
                  : "hover:bg-slate-100"
              }`}
            >
              Matérias
            </button>

            <button
              onClick={() => setTab("topics")}
              className={`w-full rounded px-3 py-2 text-left ${
                tab === "topics"
                  ? "bg-violet-100 text-violet-700"
                  : "hover:bg-slate-100"
              }`}
            >
              Temas
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
                    className="rounded bg-violet-600 px-4 text-white"
                  >
                    Adicionar
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {subjects.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded border p-3"
                    >
                      <span>{s.name}</span>
                      <button
                        onClick={() => deleteSubject(s.id)}
                        className="text-red-500"
                      >
                        🗑️
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
                        className="rounded bg-violet-600 px-4 text-white"
                      >
                        Adicionar
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {topics.map(t => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between rounded border p-3"
                        >
                          <span>{t.name}</span>
                          <button
                            onClick={() => deleteTopic(t.id)}
                            className="text-red-500"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
