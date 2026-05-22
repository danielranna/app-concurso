import CoachSubNav from "@/components/coach/CoachSubNav"

export default function CoachLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="p-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-slate-900">Coach IA</h1>
        <p className="mt-1 text-sm text-slate-500">
          Relatórios, prioridades e ações sugeridas pela IA
        </p>
      </div>
      <CoachSubNav />
      {children}
    </div>
  )
}
