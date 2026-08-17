import { Card } from "@/components/ui/card"

export default function TutorialGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="overflow-hidden">
          <div className="aspect-video animate-pulse bg-slate-100" />
          <div className="space-y-3 p-6">
            <div className="h-5 w-3/4 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
          </div>
        </Card>
      ))}
    </div>
  )
}
