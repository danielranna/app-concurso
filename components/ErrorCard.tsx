type ErrorCardProps = {
  error: {
    error_text: string
    correction_text: string
    description?: string
    reference_link?: string
    error_type: string
    topics: {
      name: string
      subjects: {
        name: string
      }
    }
  }
}

const typeStyles: Record<string, {
  label: string
  badge: string
  border: string
}> = {
  normal: {
    label: "Normal",
    badge: "bg-slate-100 text-slate-700",
    border: "border-slate-200"
  },
  critico: {
    label: "Crítico",
    badge: "bg-red-100 text-red-700",
    border: "border-red-300"
  },
  reincidente: {
    label: "Reincidente",
    badge: "bg-yellow-100 text-yellow-800",
    border: "border-yellow-300"
  },
  aprendido: {
    label: "Aprendido",
    badge: "bg-green-100 text-green-700",
    border: "border-green-300"
  }
}

export default function ErrorCard({ error }: ErrorCardProps) {
  const style = typeStyles[error.error_type] || typeStyles.normal

  return (
    <div
      className={`rounded-xl border ${style.border} bg-white p-5 shadow-sm transition hover:shadow-md`}
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">
          {error.topics.subjects.name} • {error.topics.name}
        </p>

        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${style.badge}`}
        >
          {style.label}
        </span>
      </div>

      {/* Conteúdo */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-red-600">Erro</p>
          <p className="text-slate-800">{error.error_text}</p>
        </div>

        <div>
          <p className="text-sm font-semibold text-green-600">Correção</p>
          <p className="text-slate-800">{error.correction_text}</p>
        </div>

        {error.description && (
          <p className="text-sm text-slate-500">{error.description}</p>
        )}

        {error.reference_link && (
          <a
            href={error.reference_link}
            target="_blank"
            className="inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            🔗 Ver questão
          </a>
        )}
      </div>
    </div>
  )
}
