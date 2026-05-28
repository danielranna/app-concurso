export type TextCorrectionScope = "statement" | "option" | "both"

export type TextCorrectionRule = {
  id: string
  pattern: string
  replacement: string
  scope: TextCorrectionScope
  enabled: boolean
  priority: number
}

export type AcronymAllowItem = {
  id: string
  acronym: string
  enabled: boolean
  priority: number
}

export type PdfTextCorrectionConfig = {
  rules: TextCorrectionRule[]
  acronyms: AcronymAllowItem[]
}

export type ApplyCorrectionsResult = {
  text: string
  appliedRuleIds: string[]
  appliedAcronyms: string[]
}

const DEFAULT_RULES: TextCorrectionRule[] = [
  {
    id: "default-alemde",
    pattern: "alemde",
    replacement: "além de",
    scope: "both",
    enabled: true,
    priority: 10,
  },
  {
    id: "default-p-ode",
    pattern: "P ode",
    replacement: "Pode",
    scope: "both",
    enabled: true,
    priority: 20,
  },
]

const DEFAULT_ACRONYMS: AcronymAllowItem[] = [
  { id: "default-IBS", acronym: "IBS", enabled: true, priority: 10 },
  { id: "default-CBS", acronym: "CBS", enabled: true, priority: 20 },
]

let runtimeConfig: PdfTextCorrectionConfig = {
  rules: DEFAULT_RULES,
  acronyms: DEFAULT_ACRONYMS,
}

let configLoadedAt = 0
const CACHE_TTL_MS = 60_000

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeScope(scope: string | null | undefined): TextCorrectionScope {
  if (scope === "statement" || scope === "option" || scope === "both") return scope
  return "both"
}

function normalizeAcronym(acronym: string): string {
  return acronym.trim().toUpperCase()
}

export function getPdfTextCorrectionConfig(): PdfTextCorrectionConfig {
  return runtimeConfig
}

export function setPdfTextCorrectionConfig(config: PdfTextCorrectionConfig): void {
  runtimeConfig = {
    rules: [...config.rules].sort((a, b) => a.priority - b.priority),
    acronyms: [...config.acronyms].sort((a, b) => a.priority - b.priority),
  }
  configLoadedAt = Date.now()
}

export function applyPdfTextCorrections(
  text: string,
  scope: "statement" | "option"
): ApplyCorrectionsResult {
  let out = text
  const appliedRuleIds: string[] = []
  const appliedAcronyms: string[] = []
  const { rules, acronyms } = runtimeConfig

  for (const rule of rules) {
    if (!rule.enabled) continue
    if (!(rule.scope === "both" || rule.scope === scope)) continue
    if (!rule.pattern.trim()) continue
    const re = new RegExp(escapeRegExp(rule.pattern), "gi")
    const before = out
    out = out.replace(re, rule.replacement)
    if (out !== before) appliedRuleIds.push(rule.id)
  }

  for (const item of acronyms) {
    if (!item.enabled) continue
    const acronym = normalizeAcronym(item.acronym)
    if (!acronym) continue
    const re = new RegExp(`\\b(${escapeRegExp(acronym)})(?=[a-záéíóúãõç])`, "g")
    const before = out
    out = out.replace(re, "$1 ")
    if (out !== before) appliedAcronyms.push(acronym)
  }

  return {
    text: out,
    appliedRuleIds: [...new Set(appliedRuleIds)],
    appliedAcronyms: [...new Set(appliedAcronyms)],
  }
}

export async function loadPdfTextCorrectionConfig(force = false): Promise<PdfTextCorrectionConfig> {
  if (!force && Date.now() - configLoadedAt < CACHE_TTL_MS) {
    return runtimeConfig
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      setPdfTextCorrectionConfig({ rules: DEFAULT_RULES, acronyms: DEFAULT_ACRONYMS })
      return runtimeConfig
    }

    const { supabaseServer } = await import("./supabase-server")
    const [rulesRes, acronymsRes] = await Promise.all([
      supabaseServer
        .from("pdf_text_correction_rules")
        .select("id, pattern, replacement, scope, enabled, priority")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true }),
      supabaseServer
        .from("pdf_text_acronyms")
        .select("id, acronym, enabled, priority")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true }),
    ])

    if (rulesRes.error || acronymsRes.error) {
      throw new Error(rulesRes.error?.message ?? acronymsRes.error?.message ?? "load config failed")
    }

    const rules: TextCorrectionRule[] =
      (rulesRes.data ?? []).map((r) => ({
        id: String(r.id),
        pattern: String(r.pattern ?? ""),
        replacement: String(r.replacement ?? ""),
        scope: normalizeScope(r.scope),
        enabled: Boolean(r.enabled),
        priority: Number(r.priority ?? 100),
      })) || []

    const acronyms: AcronymAllowItem[] =
      (acronymsRes.data ?? []).map((a) => ({
        id: String(a.id),
        acronym: normalizeAcronym(String(a.acronym ?? "")),
        enabled: Boolean(a.enabled),
        priority: Number(a.priority ?? 100),
      })) || []

    setPdfTextCorrectionConfig({
      rules: rules.length > 0 ? rules : DEFAULT_RULES,
      acronyms: acronyms.length > 0 ? acronyms : DEFAULT_ACRONYMS,
    })
  } catch {
    setPdfTextCorrectionConfig({ rules: DEFAULT_RULES, acronyms: DEFAULT_ACRONYMS })
  }

  return runtimeConfig
}
