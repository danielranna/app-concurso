import QuestoesSubNav from "@/components/questions/QuestoesSubNav"

export default function QuestoesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="p-4 sm:p-6">
      <QuestoesSubNav />
      {children}
    </div>
  )
}
