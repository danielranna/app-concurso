"use client"

import CoachHeader from "@/components/coach/CoachHeader"
import CoachSubNav from "@/components/coach/CoachSubNav"
import GlobalDocumentIngestWorker from "@/components/coach/GlobalDocumentIngestWorker"
import IngestQueuePanel from "@/components/coach/IngestQueuePanel"

export default function CoachLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="p-6">
      <GlobalDocumentIngestWorker />
      <CoachHeader />
      <CoachSubNav />
      <IngestQueuePanel />
      {children}
    </div>
  )
}
