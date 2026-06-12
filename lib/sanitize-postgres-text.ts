/** Remove caracteres que o PostgreSQL rejeita ao converter JSON → TEXT. */
export function sanitizePostgresText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
}

export function sanitizePostgresTextNullable(
  text: string | null | undefined
): string | null {
  if (text == null) return null
  return sanitizePostgresText(text)
}
