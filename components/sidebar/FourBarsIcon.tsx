export default function FourBarsIcon({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex flex-col justify-center gap-[5px] text-slate-600 ${className}`}
      aria-hidden
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <span key={i} className="block h-[2px] w-5 rounded-full bg-current" />
      ))}
    </span>
  )
}
