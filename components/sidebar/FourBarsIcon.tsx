type Size = "sm" | "md"

const sizeClass: Record<Size, { wrap: string; bar: string }> = {
  sm: { wrap: "gap-[2.5px]", bar: "h-px w-3.5" },
  md: { wrap: "gap-[3px]", bar: "h-px w-4" },
}

export default function FourBarsIcon({
  className = "",
  size = "sm",
}: {
  className?: string
  size?: Size
}) {
  const s = sizeClass[size]
  return (
    <span
      className={`inline-flex flex-col justify-center text-slate-600 ${s.wrap} ${className}`}
      aria-hidden
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <span key={i} className={`block rounded-full bg-current ${s.bar}`} />
      ))}
    </span>
  )
}
