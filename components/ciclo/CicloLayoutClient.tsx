"use client"

import { Suspense, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import CicloSubNav from "@/components/ciclo/CicloSubNav"
import CyclePlanSelector from "@/components/ciclo/CyclePlanSelector"

export default function CicloLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
    })
  }, [])

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CicloSubNav />
        {userId && (
          <Suspense fallback={null}>
            <div className="w-full sm:w-64">
              <CyclePlanSelector userId={userId} />
            </div>
          </Suspense>
        )}
      </div>
      <Suspense fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      }>
        {children}
      </Suspense>
    </div>
  )
}
