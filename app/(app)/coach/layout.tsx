"use client"

import CoachHeader from "@/components/coach/CoachHeader"
import CoachSubNav from "@/components/coach/CoachSubNav"
import IngestPipelinePanel from "@/components/coach/IngestPipelinePanel"

export default function CoachLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="p-6">
      <CoachHeader />
      <CoachSubNav />
      <IngestPipelinePanel />
      {children}
    </div>
  )
}
