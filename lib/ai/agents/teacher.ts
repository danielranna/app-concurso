import { searchDocumentChunks } from "../document-rag"
import { runAgent } from "../run-agent"

const SYSTEM = `Você é tutor de concursos. Responda com base nos trechos fornecidos quando existirem.
Se os trechos não cobrirem a dúvida, responda com conhecimento geral mas indique limitação.
Responda JSON: {
  "answer": "",
  "citations": [{"document_title":"","excerpt":""}],
  "source": "material" | "ai_generated"
}`

export type TeacherAnswer = {
  answer: string
  citations: { document_title: string; excerpt: string }[]
  source: "material" | "ai_generated"
}

export async function runTeacherAgent(params: {
  userId: string
  subjectId: string
  query: string
  questionContext?: Record<string, unknown>
}): Promise<TeacherAnswer> {
  const chunks = await searchDocumentChunks(
    params.userId,
    params.subjectId,
    params.query,
    5
  )

  const hasMaterial = chunks.length > 0
  const contextBlock = hasMaterial
    ? `Trechos dos materiais:\n${chunks.map((c, i) => `[${i + 1}] ${c.title}: ${c.content.slice(0, 1200)}`).join("\n\n")}`
    : "Nenhum trecho de material encontrado."

  const result = await runAgent({
    agentType: "teacher",
    userId: params.userId,
    subjectId: params.subjectId,
    systemPrompt: SYSTEM,
    userContent: JSON.stringify({
      query: params.query,
      question: params.questionContext,
      material: contextBlock,
    }),
    jsonMode: true,
    maxTokens: 1200,
  })

  if (!result.usedLlm || !result.text) {
    return {
      answer: "Configure sua chave de IA para obter explicações detalhadas.",
      citations: [],
      source: "ai_generated",
    }
  }

  try {
    const parsed = JSON.parse(result.text) as TeacherAnswer
    if (hasMaterial && parsed.source !== "material") {
      parsed.source = "material"
      if (!parsed.citations?.length) {
        parsed.citations = chunks.slice(0, 2).map((c) => ({
          document_title: c.title,
          excerpt: c.content.slice(0, 200),
        }))
      }
    }
    return parsed
  } catch {
    return {
      answer: result.text,
      citations: [],
      source: hasMaterial ? "material" : "ai_generated",
    }
  }
}
