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

const AUDITORIA_NUM_SNIPPET = `
www.tecconcursos.com.br/questoes/2423184
CEBRASPE (CESPE) - Ana (CNMP)/CNMP/Apoio Técnico Especializado/Gestão Pública/2023
Auditoria Privada - Estrutura Conceitual para Trabalhos de Asseguração
4) Acerca de estrutura conceitual e objetivos da auditoria independente, julgue o item subsequente.
A estrutura conceitual para trabalhos de asseguração é considerada uma norma.
Certo Errado
Gabarito 1) Certo
`

const CARACTERISTICAS_NUM_SNIPPET = `
www.tecconcursos.com.br/questoes/1125528
CEBRASPE (CESPE) - AFRDF (SEFAZ DF)/SEFAZ DF/2020
Auditoria - Características Inerentes ao Auditor (Julgamento e Ceticismo)
11) 12) 13) 14) Considerando a proposição P: teste
Certo Errado
Gabarito 1) Certo
`

const CIENCIA_SEM_NUM_SNIPPET = `
www.tecconcursos.com.br/questoes/8880001
CEBRASPE (CESPE) - ANL/Org/Area/2024
Ciência de Dados e Inteligência Artificial - Dado, Informação e Conhecimento
Elemento com significado atribuído é dado.
Certo Errado
Gabarito 1) Certo
`

const AUDITORIA_3494445_LINES = `
www.tecconcursos.com.br/questoes/3494445
CEBRASPE (CESPE) - Ana (CNMP)/CNMP/2023
Auditoria Privada - Estrutura Conceitual para Trabalhos de Asseguração
No que diz respeito aos relatórios, às formas e aos tipos de auditoria, julgue o item.
Certo Errado
Gabarito 1) Certo
`

const AUDITORIA_3494445_GLUE = `
www.tecconcursos.com.br/questoes/3494445
CEBRASPE (CESPE) - Ana (CNMP)/CNMP/2023
Auditoria Privada - Estrutura Conceitual para Trabalhos de Asseguração No que diz respeito aos relatórios, julgue o item.
Certo Errado
Gabarito 1) Certo
`

const AUDITORIA_325825_LINES = `
www.tecconcursos.com.br/questoes/325825
CEBRASPE (CESPE) - Ana (CNMP)/CNMP/2023
Auditoria Privada - Estrutura Conceitual para Trabalhos de Asseguração
As normas brasileiras de auditoria definem elementos dos trabalhos de asseguração. A respeito desse assunto, assinale a opção correta.
a) opção A texto longo aqui
b) opção B
c) opção C
d) opção D
e) opção E
Gabarito 1) A
`

const AUDITORIA_325825_GLUE = `
www.tecconcursos.com.br/questoes/325825
CEBRASPE (CESPE) - Ana (CNMP)/CNMP/2023
Auditoria Privada - Estrutura Conceitual para Trabalhos de Asseguração As normas brasileiras de auditoria definem elementos. A respeito desse assunto, assinale a opção correta.
a) opção A
b) opção B
c) opção C
d) opção D
e) opção E
Gabarito 1) A
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

  const aud = parseTecPdfText(AUDITORIA_NUM_SNIPPET)
  assert(
    aud.questions[0].tec_topic === "Estrutura Conceitual para Trabalhos de Asseguração",
    `aud topic: ${aud.questions[0].tec_topic}`
  )
  assert(
    aud.questions[0].statement.startsWith("Acerca de estrutura"),
    `aud stmt: ${aud.questions[0].statement.slice(0, 40)}`
  )
  assert(!aud.questions[0].tec_topic.includes("Acerca"), "aud topic clean")

  const car = parseTecPdfText(CARACTERISTICAS_NUM_SNIPPET)
  assert(
    car.questions[0].tec_topic === "Características Inerentes ao Auditor (Julgamento e Ceticismo)",
    `car topic: ${car.questions[0].tec_topic}`
  )
  assert(!car.questions[0].tec_topic.includes("11)"), "car topic no numbers")

  const ciSem = parseTecPdfText(CIENCIA_SEM_NUM_SNIPPET)
  assert(
    ciSem.questions[0].tec_topic === "Dado, Informação e Conhecimento",
    `ci sem topic: ${ciSem.questions[0].tec_topic}`
  )
  assert(
    ciSem.questions[0].statement.startsWith("Elemento com"),
    `ci sem stmt: ${ciSem.questions[0].statement.slice(0, 30)}`
  )

  const expectedTopic = "Estrutura Conceitual para Trabalhos de Asseguração"

  for (const [label, snippet] of [
    ["3494445 lines", AUDITORIA_3494445_LINES],
    ["3494445 glue", AUDITORIA_3494445_GLUE],
    ["325825 lines", AUDITORIA_325825_LINES],
    ["325825 glue", AUDITORIA_325825_GLUE],
  ] as const) {
    const p = parseTecPdfText(snippet)
    const q = p.questions[0]
    assert(q.tec_topic === expectedTopic, `${label} topic: ${q.tec_topic}`)
    assert((q.tec_topic?.length ?? 0) < 80, `${label} topic too long`)
    assert(
      !/\b(assinale|julgue|No que diz|As normas)\b/i.test(q.tec_topic ?? ""),
      `${label} topic leaked: ${q.tec_topic}`
    )
  }

  const q349 = parseTecPdfText(AUDITORIA_3494445_LINES).questions[0]
  assert(q349.statement.startsWith("No que diz respeito"), `349 stmt: ${q349.statement.slice(0, 40)}`)

  const q325 = parseTecPdfText(AUDITORIA_325825_LINES).questions[0]
  assert(q325.statement.startsWith("As normas brasileiras"), `325 stmt: ${q325.statement.slice(0, 40)}`)

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
