import type { NotebookReportStructured } from "../../coach-types"
import { runAgent } from "../run-agent"

const SYSTEM = `Você é o Agente Relatório de Caderno. Analisa desempenho após conclusão de um caderno de questões.
Priorize: (1) tópicos fracos, (2) padrões metacognitivos, (3) tempo por tópico, (4) reincidência, (5) consolidação.
Cite tec_topic exatamente como no JSON. Use APENAS os dados fornecidos. Responda em português (BR).`

export async function runReportAgent(params: {
  userId: string
  subjectId: string | null
  snapshot: Record<string, unknown>
  brain: Record<string, unknown> | null
}): Promise<{ structured: NotebookReportStructured | null; summaryMd: string }> {
  const input = {
    snapshot: params.snapshot,
    subject_brain: params.brain,
  }

  const jsonResult = await runAgent({
    agentType: "report",
    userId: params.userId,
    subjectId: params.subjectId,
    systemPrompt: SYSTEM,
    userContent: `Gere análise JSON do caderno:\n${JSON.stringify(input)}`,
    jsonMode: true,
    maxTokens: 2500,
    metadata: { notebook_id: params.snapshot.notebook_id },
  })

  if (!jsonResult.usedLlm || !jsonResult.text) {
    return { structured: null, summaryMd: "" }
  }

  let structured: NotebookReportStructured
  try {
    structured = JSON.parse(jsonResult.text) as NotebookReportStructured
  } catch {
    return { structured: null, summaryMd: "" }
  }

  const mdResult = await runAgent({
    agentType: "report",
    userId: params.userId,
    subjectId: params.subjectId,
    systemPrompt:
      "Escreva relatório em markdown (600-900 palavras) em português BR com seções: Resumo, Pontos fortes, Pontos fracos, Tempo, Plano 7 dias.",
    userContent: JSON.stringify(structured),
    maxTokens: 1500,
    metadata: { phase: "markdown" },
  })

  return {
    structured,
    summaryMd: mdResult.text || "",
  }
}
