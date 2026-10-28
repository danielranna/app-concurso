"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import WidgetBoard from "@/components/widget/WidgetBoard"
import { supabase } from "@/lib/supabase"
import { publishWidgetUser } from "@/lib/widget-bridge"

export default function WidgetPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/login?next=/widget")
        return
      }
      setUserId(user.id)
      void publishWidgetUser(user.id)
    })
  }, [router])

  if (!userId) {
    return <p className="p-8 text-slate-500">Carregando…</p>
  }

  return <WidgetBoard userId={userId} />
}
