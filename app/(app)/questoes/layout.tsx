import QuestoesSubNav from "@/components/questions/QuestoesSubNav"

export default function QuestoesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50/80 to-white">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <QuestoesSubNav />
        {children}
      </div>
    </div>
  )
}
