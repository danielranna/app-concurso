import {
  formatRomanNumeralListBreaks,
  formatStatementStructure,
  formatVfAffirmationBreaks,
} from "./tec-pdf-statement-format"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const ROMAN_FLAT =
  "As fontes do direito administrativo brasileiro incluem I a Constituição Federal. II a jurisprudência. III as leis. IV a doutrina jurídica. Vas normas regulamentares de Estados estrangeiros. Estão certos apenas os itens"

const roman = formatRomanNumeralListBreaks(ROMAN_FLAT)
assert(roman.includes("\nI-"), "I line break")
assert(roman.includes("\nII-"), "II line break")
assert(roman.includes("\nV- as normas") || roman.includes("\nV- as normas"), "V item")
assert(!roman.includes("Vas normas"), "no Vas artifact")
assert(roman.includes("Estão certos apenas os itens"), "closing phrase")

const VF_FLAT = `Sobre a substituição tributária, avalie as afirmativas e assinale (V) para a verdadeira e (F) para a falsa. ( ) A substituição tributária, no caso do ICMS. ( ) É devida a restituição. ( ) Na substituição tributária há duas normas. As afirmativas são, respectivamente,`

const vfOpts = [
  { label: "A", text: "V - F - V" },
  { label: "B", text: "V - V - F." },
  { label: "C", text: "V - V - V." },
  { label: "D", text: "F - V - F." },
  { label: "E", text: "F - V - V." },
]

const vf = formatVfAffirmationBreaks(VF_FLAT, vfOpts)
assert((vf.match(/\n\s*\(\s*\)/g) ?? []).length >= 2, "VF line breaks")

const structured = formatStatementStructure(ROMAN_FLAT, {
  type: "multiple_choice",
  options: [
    { label: "A", text: "I e III." },
    { label: "B", text: "II e V." },
    { label: "C", text: "I, IV e V." },
    { label: "D", text: "I, II, III e IV." },
    { label: "E", text: "II, III, IV e V." },
  ],
})
assert(structured.includes("\nII-"), "structured roman")

console.log("tec-pdf-statement-format tests OK")
