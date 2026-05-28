import Image from "next/image"

const LOGO_SIZE = 26

export default function SidebarBrand({ compact = false }: { compact?: boolean }) {
  if (compact) return null

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span
        className="relative shrink-0 overflow-hidden rounded-md"
        style={{ width: LOGO_SIZE, height: LOGO_SIZE }}
      >
        <Image
          src="/logo.png"
          alt="Via Aprovação"
          width={LOGO_SIZE}
          height={LOGO_SIZE}
          className="object-contain"
          priority
        />
      </span>
      <span className="truncate text-sm font-bold text-slate-800">Via Aprovação</span>
    </div>
  )
}
