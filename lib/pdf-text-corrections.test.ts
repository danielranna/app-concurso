import {
  applyPdfTextCorrections,
  setPdfTextCorrectionConfig,
  type PdfTextCorrectionConfig,
} from "./pdf-text-corrections"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const cfg: PdfTextCorrectionConfig = {
  rules: [
    {
      id: "r1",
      pattern: "alemde",
      replacement: "além de",
      scope: "both",
      enabled: true,
      priority: 10,
    },
    {
      id: "r2",
      pattern: "P ode",
      replacement: "Pode",
      scope: "statement",
      enabled: true,
      priority: 20,
    },
  ],
  acronyms: [
    { id: "a1", acronym: "CBS", enabled: true, priority: 10 },
    { id: "a2", acronym: "IBS", enabled: true, priority: 20 },
  ],
}

setPdfTextCorrectionConfig(cfg)

const statement = applyPdfTextCorrections("P ode analisar alemde tudo. IBS e CBSabrem.", "statement")
assert(statement.text.includes("Pode analisar além de tudo."), "statement literal rules")
assert(statement.text.includes("CBS abrem"), "acronym split")
assert(statement.appliedRuleIds.includes("r1"), "rule r1 tracked")
assert(statement.appliedAcronyms.includes("CBS"), "acronym tracked")

const option = applyPdfTextCorrections("P ode alemde", "option")
assert(option.text === "P ode além de", "scope respected on option")

console.log("pdf-text-corrections tests OK")
