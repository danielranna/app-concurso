"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BookOpen,
  ChevronLeft,
  HelpCircle,
  Home,
  Layers,
  LogOut,
  Sparkles,
} from "lucide-react"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const links = [
  { href: "/", label: "Início", icon: Home, exact: true },
  { href: "/erros", label: "Mapa de erros", icon: BookOpen },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/questoes", label: "Questões", icon: HelpCircle },
  { href: "/coach", label: "Coach IA", icon: Sparkles },
]

type SidebarProps = {
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null)
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const expanded = mobileOpen || !collapsed
  const showLabels = expanded

  function navLinkClass(active: boolean, compact: boolean) {
    const base =
      "flex items-center rounded-lg text-sm font-medium transition-colors"
    const layout = compact
      ? "justify-center px-2 py-2.5"
      : "gap-2.5 px-3 py-2"
    const state = active
      ? "bg-teal-50 text-teal-700"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    return `${base} ${layout} ${state}`
  }

  const asideClass = [
    "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width,transform] duration-200 ease-out",
    mobileOpen ? "translate-x-0" : "-translate-x-full",
    "lg:relative lg:z-auto lg:translate-x-0",
    expanded ? "w-56" : "w-[4.5rem]",
  ].join(" ")

  return (
    <aside className={asideClass}>
        {/* Cabeçalho */}
        <div
          className={`flex shrink-0 items-center border-b border-slate-100 ${
            showLabels ? "justify-between px-4 py-4" : "justify-center px-2 py-4"
          }`}
        >
          {showLabels ? (
            <span className="truncate text-sm font-bold text-slate-800">
              Via Aprovação
            </span>
          ) : (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-xs font-bold text-white"
              title="Via Aprovação"
            >
              VA
            </span>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:block"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <ChevronLeft
              className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Fechar menu"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Navegação */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-4">
          {links.map(({ href, label, icon: Icon, exact }) => {
            const active = exact
              ? pathname === href || pathname === ""
              : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                title={!showLabels ? label : undefined}
                onClick={onCloseMobile}
                className={navLinkClass(active, !showLabels)}
              >
                <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" />
                {showLabels && <span className="truncate">{label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Rodapé */}
        <div className="shrink-0 border-t border-slate-100 px-2 py-3">
          {showLabels && email && (
            <p className="mb-2 truncate px-3 text-xs text-slate-500" title={email}>
              {email}
            </p>
          )}
          <button
            type="button"
            onClick={handleLogout}
            title="Sair"
            className={`flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 ${
              showLabels ? "gap-2.5" : "justify-center"
            }`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {showLabels && <span>Sair</span>}
          </button>
        </div>
    </aside>
  )
}
