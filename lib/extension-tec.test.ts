import assert from "node:assert/strict"
import { parseTecIds, sanitizeTecHtml, toImportQuestion } from "./extension-tec"

{
  const html = sanitizeTecHtml(
    `<p onclick="alert(1)">Oi</p><script>alert(1)</script><img src="/img/a.png"><a href="javascript:alert(1)">x</a>`
  )
  assert.equal(html.includes("script"), false)
  assert.equal(html.includes("onclick"), false)
  assert.equal(html.includes("javascript:"), false)
  assert.match(html, /src="https:\/\/www\.tecconcursos\.com\.br\/img\/a\.png"/)
}

{
  assert.throws(() => toImportQuestion({ tec_id: 10, statement: "Enunciado", options: [], correct_answer: "" }), /Gabarito ausente/)
}

{
  const question = toImportQuestion({
    tec_id: 2555243,
    type: "multiple_choice",
    statement: `<p>Enunciado</p><img src="//cdn.tecconcursos.com.br/q.png">`,
    options: [
      { label: "A", text: "Um" },
      { label: "b", text: "Dois" },
    ],
    correct_answer: "b",
    banca: "FUNDATEC",
    ano: 2023,
    cargo: "Analista",
    orgao: "PROCERGS",
  })
  assert.equal(question.correct_answer, "B")
  assert.equal(question.tec_url, "https://www.tecconcursos.com.br/questoes/2555243")
  assert.equal(question.options[1].label, "B")
  assert.match(question.statement, /src="https:\/\/cdn\.tecconcursos\.com\.br\/q\.png"/)
  assert.equal(question.ano, 2023)
  assert.equal(question.replace_in_bank, false)
}

{
  const question = toImportQuestion({
    tec_id: 99,
    type: "certo_errado",
    statement: "Afirmação.",
    options: [
      { label: "C", text: "Certo" },
      { label: "E", text: "Errado" },
    ],
    correct_answer: "E",
  })
  assert.equal(question.type, "certo_errado")
  assert.equal(question.correct_answer, "Errado")
  assert.deepEqual(question.options.map((option) => option.label), ["Certo", "Errado"])
}

{
  assert.throws(
    () =>
      toImportQuestion({
        tec_id: 5,
        statement: "Texto",
        options: [
          { label: "A", text: "Um" },
          { label: "B", text: "Dois" },
        ],
        correct_answer: "C",
      }),
    /não corresponde/
  )
}

{
  assert.deepEqual(parseTecIds([1, "2", 2, 0, -3]), [1, 2])
  assert.throws(() => parseTecIds(Array.from({ length: 101 }, (_v, i) => i + 1)), /100/)
}
