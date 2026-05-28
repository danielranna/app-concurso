"use client"

import { useEffect, useState } from "react"
import Sidebar from "@/components/Sidebar"
import FourBarsIcon from "@/components/sidebar/FourBarsIcon"

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const onChange = () => {
      if (mq.matches) setMobileOpen(false)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return (
    <div className="flex min-h-screen bg-slate-50">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex shrink-0 items-center border-b border-slate-200 bg-white px-3 py-2.5 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 hover:bg-slate-100"
            aria-label="Abrir menu"
          >
            <FourBarsIcon size="sm" />
          </button>
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  )
}
