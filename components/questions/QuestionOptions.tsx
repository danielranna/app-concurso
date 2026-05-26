"use client"

type Option = { label: string; text: string }

type Props = {
  options: Option[]
  questionType?: "multiple_choice" | "certo_errado" | string
  selected: string | null
  eliminated: Set<string>
  locked: boolean
  result: { is_correct: boolean; correct_answer: string } | null
  onSelect: (label: string) => void
  onToggleEliminated: (label: string) => void
}

function optionDisplayText(
  opt: Option,
  questionType?: string
): { prefix: string | null; text: string } {
  const sameLabel =
    opt.label.trim().toLowerCase() === opt.text.trim().toLowerCase()
  if (questionType === "certo_errado" || sameLabel) {
    return { prefix: null, text: opt.text }
  }
  return { prefix: `${opt.label})`, text: opt.text }
}

export default function QuestionOptions({
  options,
  questionType,
  selected,
  eliminated,
  locked,
  result,
  onSelect,
  onToggleEliminated,
}: Props) {
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const isSelected = selected === opt.label
        const isEliminated = eliminated.has(opt.label)
        const showCorrect =
          result && opt.label.toLowerCase() === result.correct_answer.toLowerCase()
        const showWrong = result && isSelected && !result.is_correct

        return (
          <button
            key={opt.label}
            type="button"
            disabled={locked}
            onClick={() => {
              if (!isEliminated) onSelect(opt.label)
            }}
            onDoubleClick={(e) => {
              e.preventDefault()
              if (!locked) onToggleEliminated(opt.label)
            }}
            className={`block w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
              showCorrect
                ? "border-green-400 bg-green-50"
                : showWrong
                  ? "border-red-400 bg-red-50"
                  : isSelected
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                    : isEliminated
                      ? "border-slate-100 bg-slate-50 opacity-50"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {(() => {
              const { prefix, text } = optionDisplayText(opt, questionType)
              return (
                <>
                  {prefix != null && (
                    <span
                      className={`font-medium ${isEliminated ? "line-through decoration-slate-400" : ""}`}
                    >
                      {prefix}{" "}
                    </span>
                  )}
                  <span
                    className={`${prefix == null ? "font-medium" : ""} ${isEliminated ? "line-through decoration-slate-400" : ""}`}
                  >
                    {text}
                  </span>
                </>
              )
            })()}
          </button>
        )
      })}
      {!locked && (
        <p className="text-xs text-slate-400">
          Clique para selecionar · duplo clique para riscar ou restaurar
        </p>
      )}
    </div>
  )
}
