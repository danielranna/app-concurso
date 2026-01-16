type Topic = {
  id: string
  name: string
}

type TopicsPanelProps = {
  topics: Topic[]
  selectedTopic: string
  onSelect: (id: string) => void
  onCreate: (name: string) => void
}

import { useState } from "react"

export default function TopicsPanel({
  topics,
  selectedTopic,
  onSelect,
  onCreate
}: TopicsPanelProps) {
  const [newTopic, setNewTopic] = useState("")

  function handleCreate() {
    if (!newTopic) return
    onCreate(newTopic)
    setNewTopic("")
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-base font-semibold text-slate-800">
        🧩 Temas
      </h3>

      <div className="mb-4 flex flex-wrap gap-2">
        {topics.map(topic => {
          const active = topic.id === selectedTopic

          return (
            <button
              key={topic.id}
              onClick={() => onSelect(topic.id)}
              className={`rounded-full px-4 py-1.5 text-sm transition
                ${
                  active
                    ? "bg-blue-600 text-white"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                }
              `}
            >
              {topic.name}
            </button>
          )
        })}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          placeholder="Novo tema"
          value={newTopic}
          onChange={e => setNewTopic(e.target.value)}
        />
        <button
          onClick={handleCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          +
        </button>
      </div>
    </div>
  )
}
