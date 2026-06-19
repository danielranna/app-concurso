"use client"

import { useEffect, useState } from "react"
import { Library } from "lucide-react"
import MateriasSidebar from "@/components/materias/MateriasSidebar"

const STORAGE_KEY = "materias-sidebar-collapsed"

export default function MateriasShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === "1") setCollapsed(true)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const onChange = () => {
      if (mq.matches) setMobileOpen(false)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  function toggleCollapse() {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      } catch {
        /* ignore */
      }
      return next
    })
  }

  if (!mounted) {
    return (
      <div className="flex min-h-[calc(100vh-5rem)] gap-0 lg:gap-4">
        <div className="hidden w-60 shrink-0 lg:block" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-[calc(100vh-5rem)] gap-0 lg:gap-4">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar lista de matérias"
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <MateriasSidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={toggleCollapse}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:px-0 lg:py-0">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>

      {/* Mobile: botão para abrir lista */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 lg:hidden"
        aria-label="Abrir matérias"
      >
        <Library className="h-4 w-4" />
        Matérias
      </button>
    </div>
  )
}
