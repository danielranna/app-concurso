"use client"

import { useState } from "react"
import { TrendingUp } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import type { PaceAnalytics } from "@/lib/study-cycle-queue"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

type Props = {
  pace: PaceAnalytics | null
}

const chartConfig = {
  expected: {
    label: "Esperado",
    color: "var(--chart-2)",
  },
  actual: {
    label: "Real",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export default function CyclePaceChart({ pace }: Props) {
  const [period, setPeriod] = useState<"week" | "month">("week")

  if (!pace || (!pace.weekly.length && !pace.monthly.length)) {
    return null
  }

  const data = period === "week" ? pace.weekly : pace.monthly
  const lastPoint = data[data.length - 1]
  const delta =
    lastPoint != null ? lastPoint.actual - lastPoint.expected : 0

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <TrendingUp className="h-4 w-4" />
            </div>
            <CardTitle>Ritmo de estudo</CardTitle>
          </div>
          <CardDescription>
            {pace.blocks_per_day_label} · ~{pace.sessions_per_week_capacity}{" "}
            sessões/semana
          </CardDescription>
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-slate-50/80 p-1">
          <Button
            type="button"
            variant={period === "week" ? "default" : "ghost"}
            size="sm"
            onClick={() => setPeriod("week")}
            className="h-7 px-3"
          >
            Semanal
          </Button>
          <Button
            type="button"
            variant={period === "month" ? "default" : "ghost"}
            size="sm"
            onClick={() => setPeriod("month")}
            className="h-7 px-3"
          >
            Mensal
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {lastPoint != null && (
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Acumulado real
              </p>
              <p className="text-lg font-semibold tabular-nums text-slate-900">
                {lastPoint.actual}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Esperado
              </p>
              <p className="text-lg font-semibold tabular-nums text-slate-600">
                {lastPoint.expected}
              </p>
            </div>
            <div
              className={`rounded-xl border px-3 py-2 ${
                delta >= 0
                  ? "border-emerald-100 bg-emerald-50/80"
                  : "border-amber-100 bg-amber-50/80"
              }`}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Diferença
              </p>
              <p
                className={`text-lg font-semibold tabular-nums ${
                  delta >= 0 ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {delta >= 0 ? "+" : ""}
                {delta}
              </p>
            </div>
          </div>
        )}

        <ChartContainer config={chartConfig} className="aspect-[2.4/1] h-56 w-full">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              allowDecimals={false}
            />
            <ChartTooltip
              cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }}
              content={<ChartTooltipContent indicator="line" />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="expected"
              stroke="var(--color-expected)"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="var(--color-actual)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--color-actual)", strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
