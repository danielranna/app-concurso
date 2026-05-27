export function brainStatusBadgeClass(status: string): string {
  switch (status) {
    case "dominado":
      return "bg-emerald-100 text-emerald-800"
    case "forte":
      return "bg-green-100 text-green-800"
    case "instavel":
      return "bg-amber-100 text-amber-900"
    case "fraco":
      return "bg-orange-100 text-orange-900"
    case "critico":
      return "bg-red-100 text-red-800"
    case "ilusao_dominio":
      return "bg-violet-100 text-violet-900"
    case "sem_dados":
      return "bg-slate-100 text-slate-600"
    default:
      return "bg-slate-100 text-slate-700"
  }
}

export function trendBadgeClass(trend: string): string {
  switch (trend) {
    case "melhorando":
      return "bg-emerald-100 text-emerald-800"
    case "piorando":
      return "bg-red-100 text-red-800"
    case "estagnado":
      return "bg-amber-100 text-amber-900"
    default:
      return "bg-slate-100 text-slate-600"
  }
}
