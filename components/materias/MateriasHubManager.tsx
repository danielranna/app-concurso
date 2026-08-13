"use client"

import { useEffect, useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useDataCache } from "@/contexts/DataCacheContext"

type Subject = { id: string; name: string }
type Topic = { id: string; name: string }

export default function MateriasHubManager() {
  const cache = useDataCache()
  const [userId, setUserId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [selected, setSelected] = useState("")
  const [newSubject, setNewSubject] = useState("")
  const [newTopic, setNewTopic] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
    })
  }, [])

  async function loadSubjects(uid: string) {
    const data = await cache.getSubjects(uid)
    setSubjects(data ?? [])
  }

  async function loadTopics(uid: string, subjectId: string) {
    const res = await fetch(`/api/topics?user_id=${uid}&subject_id=${subjectId}`)
    setTopics(await res.json())
  }

  useEffect(() => {
    if (!userId) return
    void loadSubjects(userId)
  }, [userId])

  useEffect(() => {
    if (!userId || !selected) {
      setTopics([])
      return
    }
    void loadTopics(userId, selected)
  }, [userId, selected])

  async function createSubject() {
    if (!userId || !newSubject.trim()) return
    const name = newSubject.trim()
    setNewSubject("")
    const res = await fetch("/api/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, name }),
    })
    const json = await res.json()
    if (res.ok) {
      cache.invalidateSubjects(userId)
      await loadSubjects(userId)
      if (json.data?.id) setSelected(json.data.id)
    }
  }

  async function renameSubject(id: string) {
    if (!userId || !renameValue.trim()) return
    const res = await fetch(`/api/subjects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    })
    if (res.ok) {
      cache.invalidateSubjects(userId)
      setRenamingId(null)
      await loadSubjects(userId)
    }
  }

  async function deleteSubject(id: string) {
    if (!userId || !confirm("Excluir esta matéria e seus temas?")) return
    const res = await fetch(`/api/subjects/${id}`, { method: "DELETE" })
    if (res.ok) {
      cache.invalidateSubjects(userId)
      if (selected === id) setSelected("")
      await loadSubjects(userId)
    }
  }

  async function createTopic() {
    if (!userId || !selected || !newTopic.trim()) return
    const name = newTopic.trim()
    setNewTopic("")
    const res = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, subject_id: selected, name }),
    })
    if (res.ok) await loadTopics(userId, selected)
  }

  async function renameTopic(id: string) {
    if (!renameValue.trim()) return
    const res = await fetch(`/api/topics/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    })
    if (res.ok && userId && selected) {
      setRenamingId(null)
      await loadTopics(userId, selected)
    }
  }

  async function deleteTopic(id: string) {
    if (!confirm("Excluir este tema?")) return
    const res = await fetch(`/api/topics/${id}`, { method: "DELETE" })
    if (res.ok && userId && selected) await loadTopics(userId, selected)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Matérias</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createSubject()
            }}
            placeholder="Nova matéria"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => void createSubject()}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <Plus className="h-4 w-4" /> Criar
          </button>
        </div>
        <ul className="mt-3 space-y-1">
          {subjects.map((s) => (
            <li
              key={s.id}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${
                selected === s.id ? "bg-slate-100" : "hover:bg-slate-50"
              }`}
            >
              {renamingId === s.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => void renameSubject(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void renameSubject(s.id)
                  }}
                  className="mr-2 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setSelected(s.id)}
                  className="flex-1 text-left text-sm text-slate-800"
                >
                  {s.name}
                </button>
              )}
              <span className="flex gap-1">
                <button
                  type="button"
                  className="p-1 text-slate-500 hover:text-slate-800"
                  onClick={() => {
                    setRenamingId(s.id)
                    setRenameValue(s.name)
                  }}
                  title="Renomear"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="p-1 text-slate-500 hover:text-red-600"
                  onClick={() => void deleteSubject(s.id)}
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Temas</h2>
        {!selected ? (
          <p className="mt-2 text-sm text-slate-500">Selecione uma matéria para gerenciar temas.</p>
        ) : (
          <>
            <div className="mt-3 flex gap-2">
              <input
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createTopic()
                }}
                placeholder="Novo tema"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => void createTopic()}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
              >
                <Plus className="h-4 w-4" /> Criar
              </button>
            </div>
            <ul className="mt-3 space-y-1">
              {topics.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-lg px-2 py-1.5">
                  {renamingId === t.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void renameTopic(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void renameTopic(t.id)
                      }}
                      className="mr-2 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                    />
                  ) : (
                    <span className="text-sm text-slate-800">{t.name}</span>
                  )}
                  <span className="flex gap-1">
                    <button
                      type="button"
                      className="p-1 text-slate-500 hover:text-slate-800"
                      onClick={() => {
                        setRenamingId(t.id)
                        setRenameValue(t.name)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1 text-slate-500 hover:text-red-600"
                      onClick={() => void deleteTopic(t.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
