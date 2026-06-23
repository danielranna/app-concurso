import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function QuestoesPageHeader({
  title,
  description,
  backHref = "/questoes",
  backLabel = "Voltar",
  badge,
  actions,
  className,
}: {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  badge?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("space-y-4", className)}>
      <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2 text-slate-500" asChild>
        <Link href={backHref}>
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              {title}
            </h1>
            {badge && <Badge variant="secondary">{badge}</Badge>}
          </div>
          {description && (
            <p className="max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

const actionIconVariants = {
  default: "bg-slate-100 text-slate-600 group-hover:bg-teal-50 group-hover:text-teal-600",
  primary: "bg-teal-50 text-teal-600 group-hover:bg-teal-100",
  danger: "bg-red-50 text-red-600 group-hover:bg-red-100",
  violet: "bg-violet-50 text-violet-600 group-hover:bg-violet-100",
  amber: "bg-amber-50 text-amber-600 group-hover:bg-amber-100",
} as const

export function QuestoesActionCard({
  href,
  icon: Icon,
  title,
  description,
  variant = "default",
  onClick,
}: {
  href?: string
  icon: LucideIcon
  title: string
  description?: string
  variant?: keyof typeof actionIconVariants
  onClick?: () => void
}) {
  const content = (
    <>
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
          actionIconVariants[variant]
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{title}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
        )}
      </div>
    </>
  )

  const className =
    "group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 transition-all hover:border-slate-300/80 hover:shadow-md hover:shadow-slate-200/50"

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={cn(className, "text-left")}>
      {content}
    </button>
  )
}

export function QuestoesAlertBanner({
  variant = "teal",
  icon: Icon,
  title,
  description,
  href,
  children,
}: {
  variant?: "violet" | "amber" | "teal" | "red"
  icon?: LucideIcon
  title: string
  description?: string
  href?: string
  children?: React.ReactNode
}) {
  const variants = {
    violet: "border-violet-200/80 bg-violet-50/60",
    amber: "border-amber-200/80 bg-amber-50/60",
    teal: "border-teal-200/80 bg-teal-50/60",
    red: "border-red-200/80 bg-red-50/60",
  }
  const iconVariants = {
    violet: "text-violet-600",
    amber: "text-amber-600",
    teal: "text-teal-600",
    red: "text-red-600",
  }
  const titleVariants = {
    violet: "text-violet-900",
    amber: "text-amber-900",
    teal: "text-teal-900",
    red: "text-red-900",
  }

  const inner = (
    <Card className={cn("border", variants[variant])}>
      <CardContent className="flex items-start gap-4 p-4 sm:p-5">
        {Icon && (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80",
              iconVariants[variant]
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium", titleVariants[variant])}>{title}</p>
          {description && (
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          )}
          {children}
        </div>
      </CardContent>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="block transition hover:opacity-95">
        {inner}
      </Link>
    )
  }

  return inner
}

export function QuestoesSection({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function QuestoesEmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <p className="font-medium text-slate-700">{title}</p>
        {description && (
          <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
        )}
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  )
}
