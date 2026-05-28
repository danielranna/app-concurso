"use client"

import CoachHeader from "@/components/coach/CoachHeader"
import CoachSubNav from "@/components/coach/CoachSubNav"

export default function CoachLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="p-4 sm:p-6">
      <CoachHeader />
      <CoachSubNav />
      {children}
    </div>
  )
}
