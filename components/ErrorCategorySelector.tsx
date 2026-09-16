"use client"

type Category = { id: string; name: string; color?: string | null }

type Props = {
  categories: Category[]
  activeCategoryId: string | null
  onChange: (categoryId: string | null) => void
  className?: string
}

export default function ErrorCategorySelector({
  categories,
  activeCategoryId,
  onChange,
  className = "",
}: Props) {
  const chip = (active: boolean) =>
    active
      ? "border-teal-400 bg-teal-50 text-teal-900"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-xs font-medium text-slate-500">Categoria:</span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${chip(
          activeCategoryId === null
        )}`}
      >
        Todos
        {activeCategoryId === null && (
          <span className="ml-1 text-[10px] text-teal-700">· ativo</span>
        )}
      </button>
      {categories.map((c) => {
        const active = activeCategoryId === c.id
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${chip(
              active
            )}`}
            style={
              c.color && active
                ? { borderColor: c.color, backgroundColor: `${c.color}22` }
                : undefined
            }
          >
            {c.name}
            {active && (
              <span className="ml-1 text-[10px] opacity-80">· ativo</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
