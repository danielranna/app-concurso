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

const NOTEBOOK_TITLE_SNIPPET = `
tecconcursos LS - AUDITORIA TRIBUTÁRIA - CEBRASPE - CADERNO 01 https://www.tecconcursos.com.br/s/Q64cpW Ordenação: Por Matéria e Assunto
www.tecconcursos.com.br/questoes/1125409
CEBRASPE (CESPE) - AFRDF (SEFAZ DF)/SEFAZ DF/2020
Administração Geral - Tema
Enunciado da questão.
Certo Errado
Gabarito 1) Certo
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

const RL_MCQ_SNIPPET = `
www.tecconcursos.com.br/questoes/1942476
CEBRASPE (CESPE) - AFT (SEFAZ SE)/SEFAZ SE/Geral/2022
Raciocínio Lógico - Tabela Verdade das Proposições Compostas
Texto CG2A4-I
Proposição P: Se o auditor for diligente e a auditoria bem planejada, a fraude será encontrada.
Considerando a proposição P, mencionada no texto CG2A4-I, assinale a opção em que é apresentado o número mínimo.
a) 0
b) 1
c) 2
d) 3
e) 4
Gabarito 1) D
`

const RL_CE_SNIPPET = `
www.tecconcursos.com.br/questoes/2520632
CEBRASPE (CESPE) - ATM (Pref Fortaleza)/Pref Fortaleza/2023
Raciocínio Lógico - Tabela Verdade das Proposições Compostas
P: "Se a pessoa trabalha com o que gosta e está de férias, então é feliz ou está de férias."
Considerando a proposição P precedente, julgue o item seguinte.
O número de linhas da tabela-verdade associada à proposição P é inferior a 10.
Certo Errado
Gabarito 1) Certo
`

const OPERADORES_SNIPPET = `
www.tecconcursos.com.br/questoes/1414224
CEBRASPE (CESPE) - Psicop (B Coqueiros)/Pref B dos Coqueiros/2020
Raciocínio Lógico - Operadores Lógicos (Representação Simbólica; Diferença entre Proposição Simples e Composta).
Considerando-se os conectivos lógicos usuais
a) op A
b) op B
c) op C
d) op D
e) op E
Gabarito 1) A
`

const RL_REAL_SNIPPET = `
1) 2) 3) 4) LS - RACIOCÍNIO LÓGICO - EXPERIENTE - CADERNO 1 - CEBRASPE https://www.tecconcursos.com.br/s/Q65yuG Ordenação: Por Matéria e Assunto
www.tecconcursos.com.br/questoes/2773845
CEBRASPE (CESPE) - ASoc (Pref Camaçari)/Pref Camaçari/2024
Raciocínio Lógico - Tabela Verdade das Proposições Compostas
A seguir, são apresentadas as duas primeiras colunas de uma tabela-verdade, em que P e Q representam proposições lógicas simples.
A última coluna dessa tabela-verdade é a seguinte.
Com base nas informações precedentes, assinale a opção correta.
a) op A
b) op B
c) op C
d) op D
e) op E
Gabarito 1) C
`

const CIENCIA_CE_SNIPPET = `
www.tecconcursos.com.br/questoes/9990001
CEBRASPE (CESPE) - ANL (Org X)/Org X/Area/2024
Ciência de Dados e Inteligência Artificial - Ciclo de Vida e Gestão da Informação
A respeito de dado, informação, conhecimento e inteligência, julgue o item a seguir.
Na fase de armazenamento do ciclo de vida dos dados, o foco principal é prover meios.
Certo Errado
Gabarito 1) Certo
`

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function runTests() {
  const multi = parseTecPdfText(MULTIPLA_SNIPPET)
  assert(multi.name === "pagar", `multi name: ${multi.name}`)
  assert(multi.questions.length === 2, `multi count: ${multi.questions.length}`)
  assert(multi.questions[0].type === "multiple_choice", "multi type")
  assert(multi.questions[0].tec_id === 3863234, "multi tec_id")
  assert(multi.questions[0].correct_answer === "B", `multi ans: ${multi.questions[0].correct_answer}`)
  assert(multi.questions[0].options.length >= 4, `multi opts: ${multi.questions[0].options.length}`)
  assert(multi.questions[1].correct_answer === "C", `multi2 ans: ${multi.questions[1].correct_answer}`)

  const titled = parseTecPdfText(NOTEBOOK_TITLE_SNIPPET)
  assert(
    titled.name === "LS - AUDITORIA TRIBUTÁRIA - CEBRASPE - CADERNO 01",
    `titled name: ${titled.name}`
  )
  assert(
    titled.share_url === "https://www.tecconcursos.com.br/s/Q64cpW",
    `titled url: ${titled.share_url}`
  )
  assert(titled.ordering?.includes("Matéria"), `titled ordering: ${titled.ordering}`)

  const ce = parseTecPdfText(CERTO_ERRADO_SNIPPET)
  assert(ce.name === "apagar", `ce name: ${ce.name}`)
  assert(ce.questions.length === 2, `ce count: ${ce.questions.length}`)
  assert(ce.questions[0].type === "certo_errado", "ce type")
  assert(ce.questions[0].correct_answer === "Errado", `ce ans: ${ce.questions[0].correct_answer}`)
  assert(ce.questions[1].correct_answer === "Certo", `ce2 ans: ${ce.questions[1].correct_answer}`)

  const rlM = parseTecPdfText(RL_MCQ_SNIPPET)
  const rlMq = rlM.questions[0]
  assert(rlMq.banca === "CEBRASPE (CESPE)", `rl banca: ${rlMq.banca}`)
  assert(rlMq.cargo.includes("AFT"), `rl cargo: ${rlMq.cargo}`)
  assert(rlMq.tec_subject === "Raciocínio Lógico", `rl subject: ${rlMq.tec_subject}`)
  assert(
    rlMq.tec_topic === "Tabela Verdade das Proposições Compostas",
    `rl topic: ${rlMq.tec_topic}`
  )
  assert(rlMq.statement.startsWith("Texto CG2A4-I"), `rl stmt: ${rlMq.statement.slice(0, 40)}`)
  assert(!rlMq.tec_topic.includes("Considerando"), "topic must not include statement")

  const rlCe = parseTecPdfText(RL_CE_SNIPPET)
  const rlCeq = rlCe.questions[0]
  assert(rlCeq.tec_topic === "Tabela Verdade das Proposições Compostas", `rlce topic: ${rlCeq.tec_topic}`)
  assert(rlCeq.statement.startsWith("P:"), `rlce stmt: ${rlCeq.statement.slice(0, 20)}`)
  assert(!rlCeq.tec_topic.includes("P:"), "topic must not include P:")

  const op = parseTecPdfText(OPERADORES_SNIPPET)
  assert(
    op.questions[0].tec_topic?.includes("Proposição Simples e Composta"),
    `op topic: ${op.questions[0].tec_topic}`
  )
  assert(
    op.questions[0].statement.startsWith("Considerando"),
    `op stmt: ${op.questions[0].statement.slice(0, 30)}`
  )

  const rlReal = parseTecPdfText(RL_REAL_SNIPPET)
  assert(
    rlReal.name.includes("LS - RACIOCÍNIO LÓGICO") && !rlReal.name.startsWith("1)"),
    `rl real name: ${rlReal.name}`
  )
  const rlRq = rlReal.questions[0]
  assert(rlRq.tec_topic === "Tabela Verdade das Proposições Compostas", `rl real topic: ${rlRq.tec_topic}`)
  assert(rlRq.statement.startsWith("A seguir"), `rl real stmt: ${rlRq.statement.slice(0, 40)}`)

  const ci = parseTecPdfText(CIENCIA_CE_SNIPPET)
  const ciq = ci.questions[0]
  assert(
    ciq.tec_topic === "Ciclo de Vida e Gestão da Informação",
    `ci topic: ${ciq.tec_topic}`
  )
  assert(ciq.statement.startsWith("A respeito de"), `ci stmt: ${ciq.statement.slice(0, 30)}`)

  console.log("tec-pdf-parser tests OK")
}

runTests()
