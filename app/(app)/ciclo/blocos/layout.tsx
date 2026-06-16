import { Suspense } from "react"

export default function CicloBlocosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <p className="text-slate-500">Carregando blocos...</p>
        </div>
      }
    >
      {children}
    </Suspense>
  )
}
