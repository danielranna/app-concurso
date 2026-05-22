import { Suspense } from "react"

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="p-6 text-slate-500">Carregando painel...</p>}>{children}</Suspense>
}
