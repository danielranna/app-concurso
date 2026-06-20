export type AlertVariant =
  | "atencao"
  | "dica"
  | "definicao"
  | "exemplo"
  | "pegadinha"
  | "info"
  | "prova"
  | "resumo"
  | "destaque"

export const ALERT_VARIANTS: AlertVariant[] = [
  "atencao",
  "dica",
  "definicao",
  "exemplo",
  "pegadinha",
  "info",
  "prova",
  "resumo",
  "destaque",
]

export const ALERT_META: Record<
  AlertVariant,
  { icon: string; label: string; short: string; css: string }
> = {
  atencao: { icon: "⚠", label: "Atenção", short: "Atenção", css: "nota-atencao" },
  dica: { icon: "💡", label: "Dica importante", short: "Dica", css: "nota-dica" },
  definicao: { icon: "📖", label: "Definição", short: "Conceito", css: "nota-definicao" },
  exemplo: { icon: "✓", label: "Exemplo prático", short: "Exemplo", css: "nota-exemplo" },
  pegadinha: { icon: "🎯", label: "Pegadinha de prova", short: "Pegadinha", css: "nota-pegadinha" },
  info: { icon: "ℹ", label: "Informação", short: "Info", css: "nota-info" },
  prova: { icon: "📝", label: "Cai em prova", short: "Prova", css: "nota-prova" },
  resumo: { icon: "📌", label: "Resumo", short: "Resumo", css: "nota-resumo" },
  destaque: { icon: "★", label: "Destaque", short: "Destaque", css: "nota-destaque" },
}
