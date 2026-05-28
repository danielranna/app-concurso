import AppLogo from "@/components/sidebar/AppLogo"

type Props = {
  showName?: boolean
}

export default function SidebarBrand({ showName = true }: Props) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <AppLogo />
      {showName && (
        <span className="truncate text-sm font-bold text-slate-800">Via Aprovação</span>
      )}
    </div>
  )
}
