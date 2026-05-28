import { parseTecPdfTextPipeline } from "./tec-pdf-parse-pipeline"

const SNIPPET = `
Caderno de Estudo apagar https://www.tecconcursos.com.br/s/Q6PlSl
www.tecconcursos.com.br/questoes/1125409
CEBRASPE (CESPE) - AFRDF (SEFAZ DF)/SEFAZ DF/2020
Administração Geral - Accountability
No que se refere à administração pública, julgue o item.
Certo Errado
www.tecconcursos.com.br/questoes/1125404
CEBRASPE (CESPE) - AFRDF (SEFAZ DF)/SEFAZ DF/2020
Administração Geral - Nova Gestão Pública
O modelo gerencial respondeu à expansão.
Certo Errado
Gabarito 1) Errado 2) Certo
`

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const pipeline = parseTecPdfTextPipeline(SNIPPET)
assert(pipeline.questions[0]?.merged.tec_id === 1125409, "tec_id q1")
assert(pipeline.questions[0]?.candidates.primary != null, "primary q1")
assert(pipeline.questions.length === 2, "2 questions")
assert(pipeline.stats.total === 2, "stats total")
assert(
  pipeline.questions.every((q) => q.confidence === "high"),
  `CE snippets should be high confidence, got: ${pipeline.questions.map((q) => q.confidence).join(",")}`
)

const MCQ_INLINE = `
www.tecconcursos.com.br/questoes/1913666
FCC - X/Y/2020
Dir Adm - Fontes
Assinale a opção correta do item.
a) op A b) op B c) op C d) op D e) op E
Gabarito 1) C
`
const mcq = parseTecPdfTextPipeline(MCQ_INLINE)
assert(mcq.questions[0]?.confidence === "high", `MCQ inline confidence: ${mcq.questions[0]?.confidence}`)
assert(mcq.questions[0]?.candidates.strict != null, "strict should parse MCQ after preprocess")

console.log("tec-pdf-parse-merge tests OK")
