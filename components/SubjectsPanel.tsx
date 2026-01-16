type Subject = {
  id: string
  name: string
}

type SubjectsPanelProps = {
  subjects: Subject[]
  selectedSubject: string
  onSelect: (id: string) => void
  onCreate: (name: string) => void
}

import { useState } from "react"

export default function SubjectsPanel({
  subjects,
  selectedSubject,
  onSelect,
  onCreate
}: SubjectsPanelProps) {
  const [newSubject, setNewSubject] = useState("")

  function handleCreate() {
    if (!newSubject) return
    onCreate(newSubject)
    setNewSubject("")
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">
        📚 Matérias
      </h2>

      <div className="mb-4 flex flex-wrap gap-2">
        {subjects.map(subject => {
          const active = subject.id === selectedSubject

          return (
            <button
              key={subject.id}
              onClick={() => onSelect(subject.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition
                ${
                  active
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }
              `}
            >
              {subject.name}
            </button>
          )
        })}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
          placeholder="Nova matéria"
          value={newSubject}
          onChange={e => setNewSubject(e.target.value)}
        />
        <button
          onClick={handleCreate}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          +
        </button>
      </div>
    </div>
  )
}
