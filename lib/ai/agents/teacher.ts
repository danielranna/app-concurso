import { supabaseServer } from "../../supabase-server"
import { retrieveForTeacher } from "../teacher-retrieval"
import { runAgent } from "../run-agent"

const SYSTEM = `Você é tutor de concursos (Professor). Responda com base nos trechos fornecidos quando existirem.
Se os trechos não cobrirem a dúvida, responda com conhecimento geral mas indique limitação.
Cite páginas ou materiais quando possível.
Responda JSON: {
  "answer": "",
  "citations": [{"document_title":"","excerpt":"","page":null}],
  "source": "material" | "ai_generated"
}`

export type TeacherAnswer = {
  answer: string
  citations: { document_title: string; excerpt: string; page?: number | null }[]
  source: "material" | "ai_generated"
}

const DEFAULT_DAILY_CAP = 30

export async function countTeacherQueriesToday(userId: string): Promise<number> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const { count } = await supabaseServer
    .from("ai_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("agent_type", "teacher")
    .gte("created_at", start.toISOString())
  return count ?? 0
}

export async function runTeacherAgent(params: {
  userId: string
  subjectId: string
  query: string
  questionContext?: Record<string, unknown>
  skipDailyCap?: boolean
}): Promise<TeacherAnswer> {
  const chunks = await retrieveForTeacher(
    params.userId,
    params.subjectId,
    params.query,
    6
  )

  const hasMaterial = chunks.length > 0
  const contextBlock = hasMaterial
    ? `Trechos dos materiais:\n${chunks
        .map(
          (c, i) =>
            `[${i + 1}] ${c.title}${c.page ? ` (p.${c.page})` : ""}: ${c.content.slice(0, 1200)}`
        )
        .join("\n\n")}`
    : "Nenhum trecho de material encontrado."

  if (!params.skipDailyCap) {
    const used = await countTeacherQueriesToday(params.userId)
    if (used >= DEFAULT_DAILY_CAP) {
      return {
        answer:
          "Limite diário de consultas ao professor atingido. Tente amanhã ou ajuste em Configurações.",
        citations: [],
        source: "ai_generated",
      }
    }
  }

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
      answer: hasMaterial
        ? "Configure sua chave de IA para obter explicações com seus PDFs."
        : "Envie PDFs de estudo na biblioteca da matéria e configure sua chave de IA.",
      citations: [],
      source: "ai_generated",
    }
  }

  try {
    const parsed = JSON.parse(result.text) as TeacherAnswer
    if (hasMaterial && parsed.source !== "material") {
      parsed.source = "material"
      if (!parsed.citations?.length) {
        parsed.citations = chunks.slice(0, 3).map((c) => ({
          document_title: c.title,
          excerpt: c.content.slice(0, 200),
          page: c.page ?? null,
        }))
      }
    }
    return parsed
  } catch {
    return {
      answer: result.text,
      citations: hasMaterial
        ? chunks.slice(0, 2).map((c) => ({
            document_title: c.title,
            excerpt: c.content.slice(0, 200),
            page: c.page ?? null,
          }))
        : [],
      source: hasMaterial ? "material" : "ai_generated",
    }
  }
}
