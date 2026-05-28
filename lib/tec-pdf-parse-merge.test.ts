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

console.log("tec-pdf-parse-merge tests OK")
