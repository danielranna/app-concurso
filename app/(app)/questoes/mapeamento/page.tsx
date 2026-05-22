"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft } from "lucide-react"

type Unmapped = { tec_subject: string; tec_topic: string; count: number }
type Subject = { id: string; name: string }
type Topic = { id: string; name: string }

export default function MapeamentoPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [unmapped, setUnmapped] = useState<Unmapped[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [selected, setSelected] = useState<Unmapped | null>(null)
  const [subjectId, setSubjectId] = useState("")
  const [topicId, setTopicId] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      fetch(`/api/questions/mappings?user_id=${user.id}&unmapped=1`)
        .then((r) => r.json())
        .then(setUnmapped)
      fetch(`/api/subjects?user_id=${user.id}`)
        .then((r) => r.json())
        .then(setSubjects)
    })
  }, [router])

  useEffect(() => {
    if (!userId || !subjectId) {
      setTopics([])
      return
    }
    fetch(`/api/topics?user_id=${userId}&subject_id=${subjectId}`)
      .then((r) => r.json())
      .then(setTopics)
  }, [userId, subjectId])

  async function saveMapping() {
    if (!userId || !selected || !subjectId) return
    await fetch("/api/questions/mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        tec_subject: selected.tec_subject,
        tec_topic: selected.tec_topic || "",
        subject_id: subjectId,
        topic_id: topicId || null,
      }),
    })
    setUnmapped((u) =>
      u.filter(
        (x) =>
          x.tec_subject !== selected.tec_subject || x.tec_topic !== selected.tec_topic
      )
    )
    setSelected(null)
    setSubjectId("")
    setTopicId("")
  }

  return (
    <div className="p-6">
      <Link
        href="/questoes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="text-2xl font-bold">Associar matérias TEC</h1>
      <p className="mt-1 text-sm text-slate-500">
        Vincule rótulos do TEC às suas matérias e temas do mapa de erros.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ul className="space-y-2">
          {unmapped.map((u) => (
            <li key={`${u.tec_subject}|||${u.tec_topic}`}>
              <button
                type="button"
                onClick={() => setSelected(u)}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm ${
                  selected === u ? "border-blue-500 bg-blue-50" : "bg-white"
                }`}
              >
                <p className="font-medium">{u.tec_subject}</p>
                {u.tec_topic && <p className="text-slate-500">{u.tec_topic}</p>}
                <p className="text-xs text-slate-400">{u.count} questões</p>
              </button>
            </li>
          ))}
          {unmapped.length === 0 && (
            <p className="text-green-700">Tudo mapeado ou banco vazio.</p>
          )}
        </ul>
        {selected && (
          <div className="rounded-xl border bg-white p-4">
            <p className="font-medium">{selected.tec_subject}</p>
            <p className="text-sm text-slate-600">{selected.tec_topic || "(matéria inteira)"}</p>
            <label className="mt-4 block text-sm">Sua matéria</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="mt-3 block text-sm">Seu tema (opcional)</label>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={saveMapping}
              disabled={!subjectId}
              className="mt-4 rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Salvar associação
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
