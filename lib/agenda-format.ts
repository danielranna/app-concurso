function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

function intDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "")
  return digits
}

/** 18430 e 18.430 viram 18.430. */
export function formatAgendaNumber(raw: string | null | undefined): string {
  const digits = intDigits(raw ?? "")
  if (!digits) return ""
  return groupThousands(digits)
}

/** Vírgula são os centavos. 18430 vira R$ 18.430,00; 18430,5 vira R$ 18.430,50. */
export function formatAgendaMoney(raw: string | null | undefined): string {
  const text = (raw ?? "").trim().replace(/^R\$\s*/, "")
  if (!text.replace(/[^\d,]/g, "")) return ""
  const comma = text.lastIndexOf(",")
  let whole: string
  let cents: string
  if (comma >= 0) {
    whole = intDigits(text.slice(0, comma)) || "0"
    cents = (text.slice(comma + 1).replace(/\D/g, "") + "00").slice(0, 2)
  } else {
    whole = intDigits(text)
    if (!whole) return ""
    cents = "00"
  }
  return `R$ ${groupThousands(whole)},${cents}`
}
