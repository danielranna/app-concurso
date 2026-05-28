import { assessQuestionQuality } from "./tec-pdf-parse-quality"
import type { ParsedTecQuestion } from "./question-types"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const base: ParsedTecQuestion = {
  index: 1,
  tec_id: 1,
  tec_url: "https://www.tecconcursos.com.br/questoes/1",
  type: "multiple_choice",
  banca: "X",
  cargo: "Y",
  orgao: "Z",
  ano: 2020,
  tec_subject: "Dir Adm",
  tec_topic: "Fontes",
  statement: "Assinale a opção que indica apenas as fontes do direito administrativo.",
  options: [
    { label: "A", text: "a" },
    { label: "B", text: "b" },
    { label: "C", text: "c" },
    { label: "D", text: "d" },
    { label: "E", text: "e" },
  ],
  correct_answer: "C",
}

const ok = assessQuestionQuality(base)
assert(!ok.needs_review, "well-formed MCQ")

const leak = assessQuestionQuality({
  ...base,
  tec_topic: "Considerando o texto, julgue o item",
})
assert(leak.needs_review, "topic leak")
assert(leak.quality_flags.some((f) => f.code === "topic_leak_statement"), "leak flag")

const noAns = assessQuestionQuality({ ...base, correct_answer: "" })
assert(noAns.needs_review, "missing answer")

console.log("tec-pdf-parse-quality tests OK")
