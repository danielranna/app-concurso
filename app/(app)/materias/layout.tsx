import MateriasSidebar from "@/components/materias/MateriasSidebar"

export default function MateriasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 flex min-h-[calc(100vh-4rem)] flex-col sm:mx-0 lg:flex-row">
      <MateriasSidebar />
      <div className="min-w-0 flex-1 px-4 py-4 sm:px-0">{children}</div>
    </div>
  )
}
