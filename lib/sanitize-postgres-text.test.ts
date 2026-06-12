import { describe, expect, it } from "vitest"
import { sanitizePostgresText, sanitizePostgresTextNullable } from "./sanitize-postgres-text"

describe("sanitizePostgresText", () => {
  it("remove null byte e controles", () => {
    expect(sanitizePostgresText("a\u0000b\u0007c")).toBe("abc")
  })

  it("remove surrogates órfãos", () => {
    expect(sanitizePostgresText("a\uD800b")).toBe("ab")
  })

  it("preserva texto normal e acentuação", () => {
    const text = "Questão sobre alíquota — item (I)"
    expect(sanitizePostgresText(text)).toBe(text)
  })
})

describe("sanitizePostgresTextNullable", () => {
  it("retorna null para null/undefined", () => {
    expect(sanitizePostgresTextNullable(null)).toBeNull()
    expect(sanitizePostgresTextNullable(undefined)).toBeNull()
  })
})
