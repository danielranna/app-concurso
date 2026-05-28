import {
  findRomanListSequence,
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
assert(roman.includes("\nV- as normas") || roman.includes("V- as normas"), "V item")
assert(!roman.includes("Vas normas"), "no Vas artifact")
assert(roman.includes("\n\nEstão certos apenas os itens"), "closing blank line")

const TRIBUTARIA =
  "Analise as afirmativas a seguir: I. O regime de substituição tributária a que se refere a LC 87/96 dependerá de lei específica. II- A pessoa física ou jurídica que, mesmo sem intuito comercial, adquirir bens apreendidos ou abandonados é considerada contribuinte para fins da Lei Kandir. III- As obrigações referentes ao ICMSserão liquidadas apenas por compensação. Quantas afirmativas estão CORRETAS?"

const trib = formatRomanNumeralListBreaks(TRIBUTARIA)
assert(trib.includes("a seguir:\n\nI-"), "first I after seguir")
assert(trib.includes("\nII-"), "II break")
assert(trib.includes("\nIII-"), "III break")
assert(trib.includes("ICMS serão"), "ICMS spacing")
assert(/\n\nQuantas afirmativas/i.test(trib), "blank before Quantas")

const VIER =
  "O ICMS incide sobre a saída de mercadoria. I. O fato gerador ocorre na saída. II- For objeto de operação destinada a uso ou consumo. III- Vier a perecer, deteriorar-se ou extraviar-se. IV- Vier a ser remetido. Assinale:"

const vier = formatRomanNumeralListBreaks(VIER)
assert(!vier.includes("\nV- ier"), "no false V from Vier")
assert(!/\nV-\s+ier/i.test(vier), "no V- ier pattern")
const vierSeq = findRomanListSequence(VIER)
assert(vierSeq !== null && vierSeq.length >= 3, "I II III sequence in Vier case")

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
assert(
  findRomanListSequence("se apenas as afirmativas I e III estiverem corretas. II e V.") ===
    null,
  "out-of-order romans in alternatives text alone do not form a list"
)

console.log("tec-pdf-statement-format tests OK")
