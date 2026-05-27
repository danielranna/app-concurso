import QuestoesSubNav from "@/components/questions/QuestoesSubNav"

export default function QuestoesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="p-6">
      <QuestoesSubNav />
      {children}
    </div>
  )
}
