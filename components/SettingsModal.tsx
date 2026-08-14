"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { supabase } from "@/lib/supabase"
import ErrorTaxonomyPanel from "@/components/settings/ErrorTaxonomyPanel"

type Props = {
  open: boolean
  onClose: () => void
  userId: string
  onDataChange?: () => void
}

export default function SettingsModal({ open, onClose, userId, onDataChange }: Props) {
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-4xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold text-slate-800">Tipos e status de erro</h2>
          <div className="flex items-center gap-3">
            <a
              href="/configuracoes?tab=erros"
              className="text-sm text-slate-600 underline hover:text-slate-900"
            >
              Abrir em Configurações
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50"
              title="Sair da conta"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
            <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800">
              ✕
            </button>
          </div>
        </div>
        <div className="p-6">
          <ErrorTaxonomyPanel userId={userId} onDataChange={onDataChange} />
        </div>
      </div>
    </div>
  )
}
