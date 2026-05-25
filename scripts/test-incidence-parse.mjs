import fs from "fs"
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const XLSX = require("xlsx")

// Minimal inline test - load via dynamic import of compiled? 
// Use tsx via spawn
import { parseIncidenceXlsx, validateSubjectPercentSum } from "../lib/incidence-xlsx.ts"

const path =
  process.argv[2] ||
  "c:/Users/Daniel Ranna/Desktop/Mapa Incidência Fiscal CESPE 2018 - 2026.xlsx"
const p = parseIncidenceXlsx(fs.readFileSync(path))
console.log("subjects", p.stats.subject_count)
console.log("topics", p.stats.topic_count)
console.log("ok", p.stats.subjects_percent_ok, "fail", p.stats.subjects_percent_fail)
const analise = p.blocks.find((b) =>
  b.subject_label.includes("Análise das Demonstrações")
)
if (analise) {
  const v = validateSubjectPercentSum(analise)
  console.log("Analise", v.top_level_count, "sum", v.top_level_sum, v.ok)
}
const bad = p.stats.subject_percent_checks?.filter((c) => !c.ok)
if (bad?.length) console.log("failed count", bad.length, bad.slice(0, 3))
