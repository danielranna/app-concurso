"use client"

import { useEffect, useState } from "react"

type Props = {
  questionId: string
  userId: string
}

export default function QuickNote({ questionId, userId }: Props) {
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/questions/${questionId}/note?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => setNote(d.note ?? ""))
  }, [questionId, userId])

  async function save() {
    setSaving(true)
    await fetch(`/api/questions/${questionId}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, note }),
    })
    setSaving(false)
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-500">Nota rápida</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={save}
        rows={4}
        placeholder="Dúvida, conceito a revisar..."
        className="w-full resize-none rounded border border-slate-200 bg-white px-2 py-1 text-sm"
      />
      {saving && <p className="mt-1 text-xs text-slate-400">Salvando...</p>}
    </div>
  )
}
