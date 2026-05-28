import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import {
  getPdfTextCorrectionConfig,
  loadPdfTextCorrectionConfig,
  setPdfTextCorrectionConfig,
  type AcronymAllowItem,
  type TextCorrectionRule,
  type TextCorrectionScope,
} from "@/lib/pdf-text-corrections"

function normalizeScope(scope: string): TextCorrectionScope {
  if (scope === "statement" || scope === "option" || scope === "both") return scope
  return "both"
}

function parseRules(input: unknown): TextCorrectionRule[] {
  if (!Array.isArray(input)) return []
  return input.map((r, idx) => {
    const row = (r ?? {}) as Record<string, unknown>
    const pattern = String(row.pattern ?? "").trim()
    const replacement = String(row.replacement ?? "")
    return {
      id: String(row.id ?? `rule-${idx}-${Date.now()}`),
      pattern,
      replacement,
      scope: normalizeScope(String(row.scope ?? "both")),
      enabled: row.enabled !== false,
      priority: Number(row.priority ?? idx * 10 + 10),
    }
  })
}

function parseAcronyms(input: unknown): AcronymAllowItem[] {
  if (!Array.isArray(input)) return []
  return input.map((a, idx) => {
    const row = (a ?? {}) as Record<string, unknown>
    return {
      id: String(row.id ?? `acronym-${idx}-${Date.now()}`),
      acronym: String(row.acronym ?? "").trim().toUpperCase(),
      enabled: row.enabled !== false,
      priority: Number(row.priority ?? idx * 10 + 10),
    }
  })
}

export async function GET() {
  try {
    const config = await loadPdfTextCorrectionConfig(true)
    return NextResponse.json(config)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao carregar configurações"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { rules?: unknown; acronyms?: unknown }
    const rules = parseRules(body.rules)
      .filter((r) => r.pattern.length > 0)
      .sort((a, b) => a.priority - b.priority)
    const acronyms = parseAcronyms(body.acronyms)
      .filter((a) => /^[A-Z0-9]{2,10}$/.test(a.acronym))
      .sort((a, b) => a.priority - b.priority)

    const { error: delRulesErr } = await supabaseServer
      .from("pdf_text_correction_rules")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
    if (delRulesErr) throw new Error(delRulesErr.message)

    const { error: delAcronymsErr } = await supabaseServer
      .from("pdf_text_acronyms")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")
    if (delAcronymsErr) throw new Error(delAcronymsErr.message)

    if (rules.length > 0) {
      const { error } = await supabaseServer.from("pdf_text_correction_rules").insert(
        rules.map((r) => ({
          pattern: r.pattern,
          replacement: r.replacement,
          scope: r.scope,
          enabled: r.enabled,
          priority: r.priority,
        }))
      )
      if (error) throw new Error(error.message)
    }

    if (acronyms.length > 0) {
      const { error } = await supabaseServer.from("pdf_text_acronyms").insert(
        acronyms.map((a) => ({
          acronym: a.acronym,
          enabled: a.enabled,
          priority: a.priority,
        }))
      )
      if (error) throw new Error(error.message)
    }

    await loadPdfTextCorrectionConfig(true)
    return NextResponse.json(getPdfTextCorrectionConfig())
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao salvar configurações"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
