import Image from "next/image"

export default function SidebarBrand({ compact = false }: { compact?: boolean }) {
  if (compact) return null

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <Image
        src="/logo.png"
        alt=""
        width={28}
        height={28}
        className="shrink-0 rounded-md object-contain"
      />
      <span className="truncate text-sm font-bold text-slate-800">Via Aprovação</span>
    </div>
  )
}
