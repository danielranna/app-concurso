import { parseTecPdfText } from "./tec-pdf-parser"

const MULTIPLA_SNIPPET = `
Caderno de Estudo pagar https://www.tecconcursos.com.br/s/Q6PlUt Ordenação: Por Matéria
www.tecconcursos.com.br/questoes/3863234
FCC - FTE (SEFAZ MT)/SEFAZ MT/2026
AFO, Direito Financeiro - Temas Mesclados
A Lei Complementar nº 101 estabelece regras.
a) opção A texto
b) opção B texto
c) opção C texto
d) opção D texto
e) opção E texto
www.tecconcursos.com.br/questoes/3863555
FCC - FTE (SEFAZ MT)/SEFAZ MT/2026
Análise das Demonstrações - Endividamento
Texto do enunciado segunda questão.
a) 18%
b) 16%
c) 4%
d) 14%
e) 25%
Gabarito 1) B 2) C
`

const CERTO_ERRADO_SNIPPET = `
Caderno de Estudo apagar https://www.tecconcursos.com.br/s/Q6PlSl
www.tecconcursos.com.br/questoes/1125409
CEBRASPE (CESPE) - AFRDF (SEFAZ DF)/SEFAZ DF/2020
Administração Geral e Pública - Accountability
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

function runTests() {
  const multi = parseTecPdfText(MULTIPLA_SNIPPET)
  assert(multi.questions.length === 2, `multi count: ${multi.questions.length}`)
  assert(multi.questions[0].type === "multiple_choice", "multi type")
  assert(multi.questions[0].tec_id === 3863234, "multi tec_id")
  assert(multi.questions[0].correct_answer === "B", `multi ans: ${multi.questions[0].correct_answer}`)
  assert(multi.questions[0].options.length >= 4, `multi opts: ${multi.questions[0].options.length}`)
  assert(multi.questions[1].correct_answer === "C", `multi2 ans: ${multi.questions[1].correct_answer}`)

  const ce = parseTecPdfText(CERTO_ERRADO_SNIPPET)
  assert(ce.questions.length === 2, `ce count: ${ce.questions.length}`)
  assert(ce.questions[0].type === "certo_errado", "ce type")
  assert(ce.questions[0].correct_answer === "Errado", `ce ans: ${ce.questions[0].correct_answer}`)
  assert(ce.questions[1].correct_answer === "Certo", `ce2 ans: ${ce.questions[1].correct_answer}`)

  console.log("tec-pdf-parser tests OK")
}

runTests()
