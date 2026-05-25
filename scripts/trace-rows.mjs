import fs from "fs"
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const XLSX = require("xlsx")
import { parseIncidenceXlsx } from "../lib/incidence-xlsx.ts"

const path = process.argv[2]
const wb = XLSX.readFile(path)
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  defval: "",
})

for (let i = 1; i <= 12; i++) {
  const r = rows[i]
  console.log(i, "h=", typeof r[0], JSON.stringify(String(r[0])), "pct=", r[3])
}

const p = parseIncidenceXlsx(fs.readFileSync(path))
const b = p.blocks[0]
console.log("\nblock0", b.subject_label, "n=", b.groups.length)
for (const g of b.groups) {
  console.log(" ", g.code, g.parent_code, g.percent, g.name.slice(0, 40))
}
