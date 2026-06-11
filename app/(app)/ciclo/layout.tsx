import CicloSubNav from "@/components/ciclo/CicloSubNav"

export default function CicloLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="p-4 sm:p-6">
      <CicloSubNav />
      {children}
    </div>
  )
}
